import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { buildCacheKey } from '../../lib/ttl-cache.js';
import { parseQueryInt } from '../../lib/validators.js';
import {
  ANALYTICS_CACHE_CONTROL,
  analyticsCache,
  getAnalyticsAccess,
  type BreakdownQuery,
} from './shared.js';

function parseBreakdownQuery(query: BreakdownQuery): {
  year: number;
  limit: number;
  month: number | undefined;
} {
  const year = parseQueryInt(query.year, new Date().getFullYear());
  const limit = parseQueryInt(query.limit, 10);
  const month = query.month ? Number.parseInt(query.month, 10) : undefined;

  return { year, limit, month };
}

export async function registerAnalyticsBreakdownRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: BreakdownQuery }>('/by-cost-type', async (request, reply) => {
    const user = request.user!;
    const { accessFilter } = await getAnalyticsAccess(user.sub);
    const query = request.query as BreakdownQuery;
    const { year, limit, month } = parseBreakdownQuery(query);

    const where: Record<string, unknown> = { year, ...accessFilter };
    if (month) where['month'] = month;

    const cacheKey = buildCacheKey('analytics:by-cost-type', [user.sub, year, month, limit]);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const data = await prisma.costRecordMonthlyAgg.groupBy({
      by: ['costType'],
      where,
      _sum: { amountSum: true, recordCount: true },
      orderBy: { _sum: { amountSum: 'desc' } },
      take: limit,
    });

    const total = data.reduce((sum, item) => sum + Number(item._sum.amountSum || 0), 0);
    const breakdown = data
      .filter((item) => item.costType)
      .map((item) => ({
        costType: item.costType,
        amount: Number(item._sum.amountSum || 0),
        recordCount: item._sum.recordCount || 0,
        percentage: total > 0 ? (Number(item._sum.amountSum || 0) / total) * 100 : 0,
      }));

    const payload = { data: breakdown };
    analyticsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
    return reply.send(payload);
  });

  fastify.get<{ Querystring: BreakdownQuery }>('/by-location', async (request, reply) => {
    const user = request.user!;
    const { accessFilter } = await getAnalyticsAccess(user.sub);
    const query = request.query as BreakdownQuery;
    const { year, limit, month } = parseBreakdownQuery(query);

    const where: Record<string, unknown> = { year, ...accessFilter };
    if (month) where['month'] = month;

    const cacheKey = buildCacheKey('analytics:by-location', [user.sub, year, month, limit]);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const data = await prisma.costRecordMonthlyAgg.groupBy({
      by: ['locationId'],
      where,
      _sum: { amountSum: true, recordCount: true },
      orderBy: { _sum: { amountSum: 'desc' } },
      take: limit,
    });

    const locationIds = data
      .map((item) => item.locationId)
      .filter((id): id is string => id !== null);
    const locations = await prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true, type: true },
    });

    const locationMap = new Map(locations.map((location) => [location.id, location]));
    const total = data.reduce((sum, item) => sum + Number(item._sum.amountSum || 0), 0);
    const breakdown = data
      .filter((item) => item.locationId)
      .map((item) => {
        const location = locationMap.get(item.locationId!);
        return {
          locationId: item.locationId,
          locationName: location?.name || 'Unbekannt',
          locationType: location?.type || 'other',
          amount: Number(item._sum.amountSum || 0),
          recordCount: item._sum.recordCount || 0,
          percentage: total > 0 ? (Number(item._sum.amountSum || 0) / total) * 100 : 0,
        };
      });

    const payload = { data: breakdown };
    analyticsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
    return reply.send(payload);
  });

  fastify.get<{ Querystring: BreakdownQuery }>('/by-supplier', async (request, reply) => {
    const user = request.user!;
    const { accessFilter } = await getAnalyticsAccess(user.sub);
    const query = request.query as BreakdownQuery;
    const { year, limit, month } = parseBreakdownQuery(query);

    const where: Record<string, unknown> = { year, ...accessFilter };
    if (month) where['month'] = month;

    const cacheKey = buildCacheKey('analytics:by-supplier', [user.sub, year, month, limit]);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const data = await prisma.costRecordMonthlyAgg.groupBy({
      by: ['supplierId'],
      where,
      _sum: { amountSum: true, recordCount: true },
      orderBy: { _sum: { amountSum: 'desc' } },
      take: limit,
    });

    const supplierIds = data
      .map((item) => item.supplierId)
      .filter((id): id is string => id !== null);
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true, category: true },
    });

    const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    const total = data.reduce((sum, item) => sum + Number(item._sum.amountSum || 0), 0);
    const breakdown = data
      .filter((item) => item.supplierId)
      .map((item) => {
        const supplier = supplierMap.get(item.supplierId!);
        return {
          supplierId: item.supplierId,
          supplierName: supplier?.name || 'Unbekannt',
          supplierCategory: supplier?.category || 'other',
          amount: Number(item._sum.amountSum || 0),
          recordCount: item._sum.recordCount || 0,
          percentage: total > 0 ? (Number(item._sum.amountSum || 0) / total) * 100 : 0,
        };
      });

    const payload = { data: breakdown };
    analyticsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
    return reply.send(payload);
  });
}
