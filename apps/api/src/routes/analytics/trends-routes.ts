import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { buildCacheKey } from '../../lib/ttl-cache.js';
import { parseQueryInt } from '../../lib/validators.js';
import {
  ANALYTICS_CACHE_CONTROL,
  analyticsCache,
  getAnalyticsAccess,
  type ComparisonQuery,
  type TrendsQuery,
} from './shared.js';

export async function registerAnalyticsTrendRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: TrendsQuery }>('/trends', async (request, reply) => {
    const user = request.user!;
    const { accessFilter } = await getAnalyticsAccess(user.sub);
    const query = request.query as TrendsQuery;
    const months = Math.min(parseQueryInt(query.months, 12), 36);

    const cacheKey = buildCacheKey('analytics:trends', [
      user.sub,
      months,
      query.costType,
      query.locationId,
      query.supplierId,
    ]);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const where: Record<string, unknown> = { ...accessFilter };
    if (query.costType) where['costType'] = query.costType;
    if (query.locationId) where['locationId'] = query.locationId;
    if (query.supplierId) where['supplierId'] = query.supplierId;

    const data = await prisma.costRecordMonthlyAgg.groupBy({
      by: ['year', 'month'],
      where,
      _sum: { amountSum: true, recordCount: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: months,
    });

    const result = data
      .map((record) => ({
        period: `${record.year}-${String(record.month).padStart(2, '0')}`,
        year: record.year,
        month: record.month,
        amount: Number(record._sum.amountSum || 0),
        recordCount: record._sum.recordCount || 0,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    const payload = { data: result };
    analyticsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
    return reply.send(payload);
  });

  fastify.get<{ Querystring: ComparisonQuery }>('/comparison', async (request, reply) => {
    const user = request.user!;
    const { accessFilter } = await getAnalyticsAccess(user.sub);
    const year = parseQueryInt(request.query.year, new Date().getFullYear());
    const costType = request.query.costType;

    const cacheKey = buildCacheKey('analytics:comparison', [user.sub, year, costType]);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const where: Record<string, unknown> = { ...accessFilter };
    if (costType) where['costType'] = costType;

    const currentYear = await prisma.costRecordMonthlyAgg.groupBy({
      by: ['month'],
      where: { ...where, year },
      _sum: { amountSum: true },
      orderBy: { month: 'asc' },
    });

    const previousYear = await prisma.costRecordMonthlyAgg.groupBy({
      by: ['month'],
      where: { ...where, year: year - 1 },
      _sum: { amountSum: true },
      orderBy: { month: 'asc' },
    });

    const currentMap = new Map(currentYear.map((d) => [d.month, Number(d._sum.amountSum || 0)]));
    const previousMap = new Map(previousYear.map((d) => [d.month, Number(d._sum.amountSum || 0)]));

    const months = [];
    for (let month = 1; month <= 12; month++) {
      const current = currentMap.get(month) || 0;
      const previous = previousMap.get(month) || 0;
      months.push({
        month,
        currentYear: current,
        previousYear: previous,
        change: previous > 0 ? ((current - previous) / previous) * 100 : 0,
      });
    }

    const payload = { year, months };
    analyticsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
    return reply.send(payload);
  });
}
