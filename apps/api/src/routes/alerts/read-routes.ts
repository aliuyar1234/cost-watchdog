import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { sendNotFound } from '../../lib/errors.js';
import { isValidUUID } from '../../lib/validators.js';
import {
  ALERT_STATS_CACHE_CONTROL,
  MAX_LIMIT,
  alertStatsCache,
  formatAlert,
  getAlertAccessFilter,
  type AlertIdParams,
  type AlertQuery,
} from './shared.js';

export async function registerAlertReadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: AlertQuery }>('/', async (request, reply) => {
    const user = request.user!;
    const accessFilter = await getAlertAccessFilter(user.sub);
    const query = request.query as AlertQuery;
    const limit = Math.min(query.limit ?? 20, MAX_LIMIT);
    const offset = query.offset ?? 0;

    const where: Record<string, unknown> = { ...accessFilter };
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
  });

  fastify.get('/stats', async (request, reply) => {
    const user = request.user!;
    const cacheKey = `alerts:stats:${user.sub}`;
    const cached = alertStatsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ALERT_STATS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const accessFilter = await getAlertAccessFilter(user.sub);
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

    const payload = {
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byChannel: byChannel.reduce(
        (acc, item) => {
          acc[item.channel] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      last24h,
      last7d,
    };

    alertStatsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ALERT_STATS_CACHE_CONTROL);
    return reply.send(payload);
  });

  fastify.get<{ Params: AlertIdParams }>('/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    if (!isValidUUID(id)) {
      return sendNotFound(reply, 'Alert');
    }

    const accessFilter = await getAlertAccessFilter(user.sub);
    const alert = await prisma.alert.findFirst({
      where: { id, ...accessFilter },
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
  });
}
