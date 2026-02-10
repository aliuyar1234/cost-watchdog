import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { sendNotFound } from '../../lib/errors.js';
import { isValidUUID } from '../../lib/validators.js';
import {
  ANOMALY_INCLUDE,
  ANOMALY_STATS_CACHE_CONTROL,
  MAX_LIMIT,
  anomalyStatsCache,
  formatAnomaly,
  getAnomalyAccessFilter,
  type AnomalyIdParams,
  type AnomalyQuery,
} from './shared.js';

export async function registerAnomalyReadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: AnomalyQuery }>('/', async (request, reply) => {
    const user = request.user!;
    const accessFilter = await getAnomalyAccessFilter(user.sub);
    const query = request.query as AnomalyQuery;
    const limit = Math.min(Number(query.limit) || 20, MAX_LIMIT);
    const offset = Number(query.offset) || 0;

    const where: Record<string, unknown> = { ...accessFilter };
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
  });

  fastify.get('/stats', async (request, reply) => {
    const user = request.user!;

    const cacheKey = `anomalies:stats:${user.sub}`;
    const cached = anomalyStatsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ANOMALY_STATS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const accessFilter = await getAnomalyAccessFilter(user.sub);
    const [byStatus, bySeverity, byType, recent] = await Promise.all([
      prisma.anomaly.groupBy({
        by: ['status'],
        _count: true,
        where: accessFilter,
      }),
      prisma.anomaly.groupBy({
        by: ['severity'],
        _count: true,
        where: { status: 'new', ...accessFilter },
      }),
      prisma.anomaly.groupBy({
        by: ['type'],
        _count: true,
        where: { status: 'new', ...accessFilter },
      }),
      prisma.anomaly.count({
        where: {
          status: 'new',
          ...accessFilter,
          detectedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
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
      bySeverity: bySeverity.reduce(
        (acc, item) => {
          acc[item.severity] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byType: byType.reduce(
        (acc, item) => {
          acc[item.type] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      newLast24h: recent,
    };

    anomalyStatsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ANOMALY_STATS_CACHE_CONTROL);
    return reply.send(payload);
  });

  fastify.get<{ Params: AnomalyIdParams }>('/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    if (!isValidUUID(id)) {
      return sendNotFound(reply, 'Anomaly');
    }

    const accessFilter = await getAnomalyAccessFilter(user.sub);
    const anomaly = await prisma.anomaly.findFirst({
      where: { id, ...accessFilter },
      include: ANOMALY_INCLUDE,
    });

    if (!anomaly) {
      return sendNotFound(reply, 'Anomaly');
    }

    return reply.send(formatAnomaly(anomaly));
  });
}
