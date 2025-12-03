import { FastifyPluginAsync } from 'fastify';
import type { Alert } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { sendNotFound, sendBadRequest } from '../lib/errors.js';
import { isValidUUID } from '../lib/validators.js';
import { authenticate } from '../middleware/auth.js';
import { requireScope } from '../middleware/api-key.js';

// Maximum limit for list queries
const MAX_LIMIT = 100;

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
  // Apply auth and scope check to all routes except track-click (public)
  fastify.addHook('preHandler', async (request, reply) => {
    // Allow track-click without auth
    if (request.url.endsWith('/track-click')) {
      return;
    }
    // Cast to async function type - Fastify supports async hooks without done callback
    await (authenticate as (req: typeof request, rep: typeof reply) => Promise<void>)(request, reply);
    await requireScope('read:alerts')(request, reply);
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

    const [byStatus, byChannel, last24h, last7d] = await Promise.all([
      prisma.alert.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.alert.groupBy({
        by: ['channel'],
        _count: true,
      }),
      prisma.alert.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.alert.count({
        where: {
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
   */
  fastify.post<{ Params: AlertIdParams }>(
    '/:id/track-click',
    async (request, reply) => {
      const { id } = request.params;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Alert');
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
