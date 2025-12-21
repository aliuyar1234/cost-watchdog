import { FastifyPluginAsync } from 'fastify';
import type { Alert } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/db.js';
import { sendNotFound, sendBadRequest } from '../lib/errors.js';
import { isValidUUID } from '../lib/validators.js';
import { authenticate } from '../middleware/auth.js';
import { requireScope } from '../lib/api-key-scopes.js';
import { getUserRestrictions, buildAccessFilter } from '../lib/access-control.js';
import { secrets } from '../lib/secrets.js';

// Maximum limit for list queries
const MAX_LIMIT = 100;

// Secret for HMAC token generation (read from Docker secrets or AUTH_SECRET env)
// In production, this MUST be set - no fallback to prevent token forgery
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const ALERT_TOKEN_SECRET = secrets.getAuthSecret();

if (!ALERT_TOKEN_SECRET) {
  if (IS_PRODUCTION) {
    throw new Error('FATAL: AUTH_SECRET is required for alert token generation in production');
  }
  console.warn('[Alerts] WARNING: AUTH_SECRET not set. Using insecure default for development only.');
}

// Use the secret or a dev-only fallback (never in production)
const EFFECTIVE_ALERT_SECRET = ALERT_TOKEN_SECRET || 'dev-secret-for-alerts-NEVER-USE-IN-PROD';

/**
 * Generate an HMAC token for alert click tracking.
 * This ensures only legitimate alert recipients can mark alerts as clicked.
 */
export function generateAlertToken(alertId: string): string {
  const hmac = createHmac('sha256', EFFECTIVE_ALERT_SECRET);
  hmac.update(alertId);
  return hmac.digest('hex');
}

/**
 * Verify an HMAC token for alert click tracking.
 */
function verifyAlertToken(alertId: string, token: string): boolean {
  try {
    const expectedToken = generateAlertToken(alertId);
    const tokenBuffer = Buffer.from(token, 'hex');
    const expectedBuffer = Buffer.from(expectedToken, 'hex');
    if (tokenBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(tokenBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

interface AlertQuery {
  status?: string;
  channel?: string;
  anomalyId?: string;
  limit?: number;
  offset?: number;
}

interface AlertIdParams {
  id: string;
}

interface TrackClickQuery {
  token?: string;
}

interface AlertResponse {
  id: string;
  anomalyId: string;
  channel: string;
  recipient: string;
  subject: string;
  status: string;
  sentAt: string | null;
  clickedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * Alert routes
 */
export const alertRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth and scope check to all routes except track-click (uses HMAC token)
  fastify.addHook('preHandler', async (request, reply) => {
    // Allow track-click with HMAC token authentication (not JWT)
    if (request.url.includes('/track-click')) {
      return;
    }
    // Cast to async function type - Fastify supports async hooks without done callback
    await (authenticate as (req: typeof request, rep: typeof reply) => Promise<void>)(request, reply);
    const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
    const requiredScope = isReadMethod ? 'read:alerts' : 'write:alerts';
    await requireScope(requiredScope)(request, reply);
  });

  /**
   * GET /alerts - List alerts
   */
  fastify.get<{ Querystring: AlertQuery }>(
    '/',
    async (request, reply) => {
      const user = request.user!;

      const query = request.query as AlertQuery;
      const limit = Math.min(query.limit ?? 20, MAX_LIMIT);
      const offset = query.offset ?? 0;

      const where: Record<string, unknown> = {};
      if (query.status) where['status'] = query.status;
      if (query.channel) where['channel'] = query.channel;
      if (query.anomalyId) where['anomalyId'] = query.anomalyId;

      const [data, total] = await Promise.all([
        prisma.alert.findMany({
          where,
          include: {
            anomaly: {
              select: {
                id: true,
                type: true,
                severity: true,
                message: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.alert.count({ where }),
      ]);

      return reply.send({
        data: data.map(formatAlert),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + data.length < total,
        },
      });
    }
  );

  /**
   * GET /alerts/stats
   */
  fastify.get('/stats', async (request, reply) => {
    const user = request.user!;

    // Get user's access restrictions and build filter for alerts via anomaly -> costRecord
    const restrictions = await getUserRestrictions(user.sub);
    const accessFilter: Record<string, unknown> = restrictions.hasRestrictions
      ? { anomaly: { costRecord: buildAccessFilter(restrictions) } }
      : {};

    const [byStatus, byChannel, last24h, last7d] = await Promise.all([
      prisma.alert.groupBy({
        by: ['status'],
        where: accessFilter,
        _count: true,
      }),
      prisma.alert.groupBy({
        by: ['channel'],
        where: accessFilter,
        _count: true,
      }),
      prisma.alert.count({
        where: {
          ...accessFilter,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.alert.count({
        where: {
          ...accessFilter,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return reply.send({
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byChannel: byChannel.reduce((acc, item) => {
        acc[item.channel] = item._count;
        return acc;
      }, {} as Record<string, number>),
      last24h,
      last7d,
    });
  });

  /**
   * GET /alerts/:id
   */
  fastify.get<{ Params: AlertIdParams }>(
    '/:id',
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Alert');
      }

      const alert = await prisma.alert.findUnique({
        where: { id },
        include: {
          anomaly: {
            include: {
              costRecord: {
                include: {
                  location: true,
                  supplier: true,
                },
              },
            },
          },
        },
      });

      if (!alert) {
        return sendNotFound(reply, 'Alert');
      }

      return reply.send(formatAlert(alert));
    }
  );

  /**
   * POST /alerts/:id/track-click
   * Requires a valid HMAC token to prevent unauthorized access.
   * Token should be included in alert emails/notifications.
   */
  fastify.post<{ Params: AlertIdParams; Querystring: TrackClickQuery }>(
    '/:id/track-click',
    async (request, reply) => {
      const { id } = request.params;
      const { token } = request.query;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Alert');
      }

      // Require valid HMAC token for authentication
      if (!token || !verifyAlertToken(id, token)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Invalid or missing alert token',
        });
      }

      const existing = await prisma.alert.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'Alert');
      }

      if (!existing.clickedAt) {
        await prisma.alert.update({
          where: { id },
          data: { clickedAt: new Date() },
        });
      }

      return reply.send({ success: true });
    }
  );

  /**
   * POST /alerts/:id/retry
   */
  fastify.post<{ Params: AlertIdParams }>(
    '/:id/retry',
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Alert');
      }

      const existing = await prisma.alert.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'Alert');
      }

      if (existing.status !== 'failed') {
        return sendBadRequest(reply, 'Only failed alerts can be retried');
      }

      const alert = await prisma.alert.update({
        where: { id },
        data: {
          status: 'pending',
          errorMessage: null,
        },
      });

      await prisma.outboxEvent.create({
        data: {
          eventType: 'alert.retry',
          aggregateType: 'alert',
          aggregateId: id,
          payload: { alertId: id },
        },
      });

      return reply.send(formatAlert(alert));
    }
  );
};

function formatAlert(alert: Alert & { anomaly?: unknown }): AlertResponse & { anomaly?: unknown } {
  return {
    id: alert.id,
    anomalyId: alert.anomalyId,
    channel: alert.channel,
    recipient: alert.recipient,
    subject: alert.subject,
    status: alert.status,
    sentAt: alert.sentAt?.toISOString() ?? null,
    clickedAt: alert.clickedAt?.toISOString() ?? null,
    errorMessage: alert.errorMessage,
    createdAt: alert.createdAt.toISOString(),
    ...(alert.anomaly ? { anomaly: alert.anomaly } : {}),
  };
}

export default alertRoutes;
