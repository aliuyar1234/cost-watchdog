import type { FastifyInstance } from 'fastify';
import { logAuditEvent } from '../../lib/audit.js';
import { prisma } from '../../lib/db.js';
import { sendBadRequest, sendNotFound } from '../../lib/errors.js';
import { requireScope } from '../../lib/api-key-scopes.js';
import { sanitizeTextArea } from '../../lib/sanitize.js';
import { isValidUUID } from '../../lib/validators.js';
import { requireRole } from '../../middleware/auth.js';
import { getAuditContext } from '../../middleware/request-context.js';
import {
  ANOMALY_INCLUDE,
  MAX_RESOLUTION_LENGTH,
  VALID_STATUSES,
  formatAnomaly,
  getAnomalyAccessFilter,
  type AcknowledgeBody,
  type AnomalyIdParams,
  type UpdateStatusBody,
} from './shared.js';

export async function registerAnomalyWriteRoutes(fastify: FastifyInstance): Promise<void> {
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
      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(
          reply,
          `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`,
        );
      }

      const sanitizedResolution = resolution ? sanitizeTextArea(resolution) : undefined;
      const accessFilter = await getAnomalyAccessFilter(user.sub);
      const existing = await prisma.anomaly.findFirst({ where: { id, ...accessFilter } });
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

      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'anomaly',
        entityId: id,
        action: 'acknowledge',
        before: { status: existing.status },
        after: { status: 'acknowledged' },
        metadata: {
          resolution: sanitizedResolution,
          anomalyType: existing.type,
          severity: existing.severity,
        },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send(formatAnomaly(anomaly));
    },
  );

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
      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(
          reply,
          `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`,
        );
      }

      const sanitizedResolution = resolution ? sanitizeTextArea(resolution) : undefined;
      const accessFilter = await getAnomalyAccessFilter(user.sub);
      const existing = await prisma.anomaly.findFirst({ where: { id, ...accessFilter } });
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

      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'anomaly',
        entityId: id,
        action: 'update',
        before: { status: existing.status },
        after: { status: 'resolved' },
        metadata: {
          resolution: sanitizedResolution,
          anomalyType: existing.type,
          severity: existing.severity,
        },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send(formatAnomaly(anomaly));
    },
  );

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
      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(
          reply,
          `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`,
        );
      }

      const sanitizedResolution = resolution
        ? sanitizeTextArea(resolution)
        : 'Marked as false positive';
      const accessFilter = await getAnomalyAccessFilter(user.sub);
      const existing = await prisma.anomaly.findFirst({ where: { id, ...accessFilter } });
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

      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'anomaly',
        entityId: id,
        action: 'update',
        before: { status: existing.status },
        after: { status: 'false_positive' },
        metadata: {
          resolution: sanitizedResolution,
          anomalyType: existing.type,
          severity: existing.severity,
        },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send(formatAnomaly(anomaly));
    },
  );

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
      if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
        return sendBadRequest(
          reply,
          `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        );
      }

      if (resolution && resolution.length > MAX_RESOLUTION_LENGTH) {
        return sendBadRequest(
          reply,
          `Resolution must be at most ${MAX_RESOLUTION_LENGTH} characters`,
        );
      }

      const sanitizedResolution = resolution ? sanitizeTextArea(resolution) : undefined;
      const accessFilter = await getAnomalyAccessFilter(user.sub);
      const existing = await prisma.anomaly.findFirst({ where: { id, ...accessFilter } });
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
    },
  );
}
