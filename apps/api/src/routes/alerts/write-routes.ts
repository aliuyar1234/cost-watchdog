import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { sendBadRequest, sendNotFound } from '../../lib/errors.js';
import { isValidUUID } from '../../lib/validators.js';
import {
  formatAlert,
  getAlertAccessFilter,
  verifyAlertToken,
  type AlertIdParams,
  type TrackClickQuery,
} from './shared.js';

export async function registerAlertWriteRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: AlertIdParams; Querystring: TrackClickQuery }>(
    '/:id/track-click',
    async (request, reply) => {
      const { id } = request.params;
      const { token } = request.query;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'Alert');
      }

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
    },
  );

  fastify.post<{ Params: AlertIdParams }>('/:id/retry', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    if (!isValidUUID(id)) {
      return sendNotFound(reply, 'Alert');
    }

    const accessFilter = await getAlertAccessFilter(user.sub);
    const existing = await prisma.alert.findFirst({ where: { id, ...accessFilter } });
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
  });
}
