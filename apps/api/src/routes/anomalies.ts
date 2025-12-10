import { FastifyPluginAsync } from 'fastify';
import type { Anomaly, CostRecord, Location, Supplier } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/db.js';
import { sendNotFound, sendBadRequest } from '../lib/errors.js';
import { isValidUUID } from '../lib/validators.js';
import { sanitizeTextArea } from '../lib/sanitize.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireScope } from '../lib/api-key-scopes.js';
import { logAuditEvent } from '../lib/audit.js';
import { getAuditContext } from '../middleware/request-context.js';

// Maximum limit for list queries
const MAX_LIMIT = 100;

interface AnomalyWithRelations extends Anomaly {
  costRecord: (CostRecord & {
    location: Location | null;
    supplier: Supplier | null;
  }) | null;
}

interface AnomalyQuery {
  status?: string;
  severity?: string;
  costRecordId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

interface AnomalyIdParams {
  id: string;
}

interface AcknowledgeBody {
  resolution?: string;
}

interface UpdateStatusBody {
  status: 'new' | 'acknowledged' | 'resolved' | 'false_positive';
  resolution?: string;
}

// Valid anomaly statuses
const VALID_STATUSES = ['new', 'acknowledged', 'resolved', 'false_positive'] as const;
const MAX_RESOLUTION_LENGTH = 2000;

// Include clause for anomaly queries with relations
const ANOMALY_INCLUDE = {
  costRecord: {
    include: {
      location: true,
      supplier: true,
    },
  },
} as const;

/**
 * Anomaly routes
 */
export const anomalyRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', authenticate);
  // Apply scope check for read operations (write operations have requireRole)
  fastify.addHook('preHandler', requireScope('read:anomalies'));

  /**
   * GET /anomalies - List anomalies
   */
  fastify.get<{ Querystring: AnomalyQuery }>(
    '/',
    async (request, reply) => {
      const user = request.user!;

      const query = request.query as AnomalyQuery;
      const limit = Math.min(Number(query.limit) || 20, MAX_LIMIT);
      const offset = Number(query.offset) || 0;

      const where: Record<string, unknown> = {};
      if (query.status) where['status'] = query.status;
      if (query.severity) where['severity'] = query.severity;
      if (query.costRecordId) where['costRecordId'] = query.costRecordId;
      if (query.type) where['type'] = query.type;

      const [data, total] = await Promise.all([
        prisma.anomaly.findMany({
          where,
          include: ANOMALY_INCLUDE,
          orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
          take: limit,
          skip: offset,
        }),
        prisma.anomaly.count({ where }),
      ]);

      return reply.send({
        data: data.map(formatAnomaly),
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
   * GET /anomalies/stats - Get anomaly statistics
   */
  fastify.get('/stats', async (request, reply) => {
    const user = request.user!;

    const [byStatus, bySeverity, byType, recent] = await Promise.all([
      prisma.anomaly.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.anomaly.groupBy({
        by: ['severity'],
        _count: true,
        where: { status: 'new' },
      }),
      prisma.anomaly.groupBy({
        by: ['type'],
        _count: true,
        where: { status: 'new' },
      }),
      prisma.anomaly.count({
        where: {
          status: 'new',
          detectedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return reply.send({
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count;
        return acc;
      }, {} as Record<string, number>),
      newLast24h: recent,
    });
  });

  /**
   * GET /anomalies/:id - Get single anomaly
   */
  fastify.get<{ Params: AnomalyIdParams }>(
    '/:id',
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Anomaly');
      }

      const anomaly = await prisma.anomaly.findUnique({
        where: { id },
        include: {
          costRecord: {
            include: {
              location: true,
              supplier: true,
            },
          },
        },
      });

      if (!anomaly) {
        return sendNotFound(reply, 'Anomaly');
      }

      return reply.send(formatAnomaly(anomaly));
    }
  );

  /**
   * POST /anomalies/:id/acknowledge
   * Requires manager or admin role
   * API keys need write:anomalies scope
   */
  fastify.post<{ Params: AnomalyIdParams; Body: AcknowledgeBody }>(
    '/:id/acknowledge',
    { preHandler: [requireScope('write:anomalies'), requireRole('manager', 'admin')] },
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;
      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Anomaly');
      }

      const { resolution } = request.body as AcknowledgeBody;

      // Validate resolution length
      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(reply, `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`);
      }

      // Sanitize resolution input to prevent XSS
      const sanitizedResolution = resolution ? sanitizeTextArea(resolution) : undefined;

      const existing = await prisma.anomaly.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'Anomaly');
      }

      const anomaly = await prisma.anomaly.update({
        where: { id },
        data: {
          status: 'acknowledged',
          acknowledgedBy: user.sub,
          acknowledgedAt: new Date(),
          acknowledgeReason: sanitizedResolution,
        },
        include: ANOMALY_INCLUDE,
      });

      // Audit log: anomaly acknowledged
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'anomaly',
        entityId: id,
        action: 'acknowledge',
        before: { status: existing.status },
        after: { status: 'acknowledged' },
        metadata: { resolution: sanitizedResolution, anomalyType: existing.type, severity: existing.severity },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send(formatAnomaly(anomaly));
    }
  );

  /**
   * POST /anomalies/:id/resolve
   * Requires manager or admin role
   * API keys need write:anomalies scope
   */
  fastify.post<{ Params: AnomalyIdParams; Body: AcknowledgeBody }>(
    '/:id/resolve',
    { preHandler: [requireScope('write:anomalies'), requireRole('manager', 'admin')] },
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;
      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Anomaly');
      }

      const { resolution } = request.body as AcknowledgeBody;

      // Validate resolution length
      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(reply, `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`);
      }

      // Sanitize resolution input to prevent XSS
      const sanitizedResolution = resolution ? sanitizeTextArea(resolution) : undefined;

      const existing = await prisma.anomaly.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'Anomaly');
      }

      const anomaly = await prisma.anomaly.update({
        where: { id },
        data: {
          status: 'resolved',
          acknowledgedBy: existing.acknowledgedBy ?? user.sub,
          acknowledgedAt: existing.acknowledgedAt ?? new Date(),
          resolvedAt: new Date(),
          acknowledgeReason: sanitizedResolution,
        },
        include: ANOMALY_INCLUDE,
      });

      // Audit log: anomaly resolved
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'anomaly',
        entityId: id,
        action: 'update',
        before: { status: existing.status },
        after: { status: 'resolved' },
        metadata: { resolution: sanitizedResolution, anomalyType: existing.type, severity: existing.severity },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send(formatAnomaly(anomaly));
    }
  );

  /**
   * POST /anomalies/:id/false-positive
   * Requires manager or admin role
   * API keys need write:anomalies scope
   */
  fastify.post<{ Params: AnomalyIdParams; Body: AcknowledgeBody }>(
    '/:id/false-positive',
    { preHandler: [requireScope('write:anomalies'), requireRole('manager', 'admin')] },
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;
      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Anomaly');
      }

      const { resolution } = request.body as AcknowledgeBody;

      // Validate resolution length
      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(reply, `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`);
      }

      // Sanitize resolution input to prevent XSS
      const sanitizedResolution = resolution ? sanitizeTextArea(resolution) : 'Marked as false positive';

      const existing = await prisma.anomaly.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'Anomaly');
      }

      const anomaly = await prisma.anomaly.update({
        where: { id },
        data: {
          status: 'false_positive',
          acknowledgedBy: user.sub,
          acknowledgedAt: new Date(),
          acknowledgeReason: sanitizedResolution,
        },
        include: ANOMALY_INCLUDE,
      });

      // Audit log: anomaly marked as false positive
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'anomaly',
        entityId: id,
        action: 'update',
        before: { status: existing.status },
        after: { status: 'false_positive' },
        metadata: { resolution: sanitizedResolution, anomalyType: existing.type, severity: existing.severity },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send(formatAnomaly(anomaly));
    }
  );

  /**
   * PATCH /anomalies/:id - Update status
   * Requires manager or admin role
   * API keys need write:anomalies scope
   */
  fastify.patch<{ Params: AnomalyIdParams; Body: UpdateStatusBody }>(
    '/:id',
    { preHandler: [requireScope('write:anomalies'), requireRole('manager', 'admin')] },
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;
      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Anomaly');
      }

      const { status, resolution } = request.body as UpdateStatusBody;

      // Validate status enum
      if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
        return sendBadRequest(reply, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }

      // Validate resolution length
      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(reply, `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`);
      }

      // Sanitize resolution input to prevent XSS
      const sanitizedResolution = resolution ? sanitizeTextArea(resolution) : undefined;

      const existing = await prisma.anomaly.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'Anomaly');
      }

      const updateData: Record<string, unknown> = { status };

      if (status !== 'new') {
        updateData['acknowledgedBy'] = existing.acknowledgedBy ?? user.sub;
        updateData['acknowledgedAt'] = existing.acknowledgedAt ?? new Date();
      }

      if (sanitizedResolution) {
        updateData['acknowledgeReason'] = sanitizedResolution;
      }

      const anomaly = await prisma.anomaly.update({
        where: { id },
        data: updateData,
        include: ANOMALY_INCLUDE,
      });

      return reply.send(formatAnomaly(anomaly));
    }
  );
};

function decimalToNumber(value: Decimal | null | undefined): number | null {
  return value ? Number(value) : null;
}

interface AnomalyResponse {
  id: string;
  type: string;
  severity: string;
  status: string;
  message: string;
  details: unknown;
  isBackfill: boolean;
  detectedAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolution: string | null;
  costRecord: {
    id: string;
    costType: string;
    amount: number;
    quantity: number | null;
    unit: string | null;
    pricePerUnit: number | null;
    periodStart: string;
    periodEnd: string;
    invoiceNumber: string | null;
    location: {
      id: string;
      name: string;
      type: string;
    } | null;
    supplier: {
      id: string;
      name: string;
      category: string;
    } | null;
  } | null;
}

function formatAnomaly(anomaly: AnomalyWithRelations): AnomalyResponse {
  return {
    id: anomaly.id,
    type: anomaly.type,
    severity: anomaly.severity,
    status: anomaly.status,
    message: anomaly.message,
    details: anomaly.details,
    isBackfill: anomaly.isBackfill,
    detectedAt: anomaly.detectedAt.toISOString(),
    acknowledgedBy: anomaly.acknowledgedBy,
    acknowledgedAt: anomaly.acknowledgedAt?.toISOString() ?? null,
    resolution: anomaly.acknowledgeReason,
    costRecord: anomaly.costRecord
      ? {
          id: anomaly.costRecord.id,
          costType: anomaly.costRecord.costType,
          amount: Number(anomaly.costRecord.amount),
          quantity: decimalToNumber(anomaly.costRecord.quantity),
          unit: anomaly.costRecord.unit,
          pricePerUnit: decimalToNumber(anomaly.costRecord.pricePerUnit),
          periodStart: anomaly.costRecord.periodStart.toISOString(),
          periodEnd: anomaly.costRecord.periodEnd.toISOString(),
          invoiceNumber: anomaly.costRecord.invoiceNumber,
          location: anomaly.costRecord.location
            ? {
                id: anomaly.costRecord.location.id,
                name: anomaly.costRecord.location.name,
                type: anomaly.costRecord.location.type,
              }
            : null,
          supplier: anomaly.costRecord.supplier
            ? {
                id: anomaly.costRecord.supplier.id,
                name: anomaly.costRecord.supplier.name,
                category: anomaly.costRecord.supplier.category,
              }
            : null,
        }
      : null,
  };
}

export default anomalyRoutes;
