import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { buildCacheKey } from '../../lib/ttl-cache.js';
import { parseQueryInt } from '../../lib/validators.js';
import {
  ANALYTICS_CACHE_CONTROL,
  analyticsCache,
  getAnalyticsAccess,
  type DashboardQuery,
} from './shared.js';

export async function registerAnalyticsDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: DashboardQuery }>('/dashboard', async (request, reply) => {
    const user = request.user!;
    const { accessFilter, anomalyAccessFilter } = await getAnalyticsAccess(user.sub);
    const query = request.query as DashboardQuery;
    const year = parseQueryInt(query.year, new Date().getFullYear());
    const currentMonth = new Date().getMonth() + 1;

    const cacheKey = buildCacheKey('analytics:dashboard', [user.sub, year, query.locationId]);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
      return reply.send(cached);
    }

    const yearAgg = await prisma.costRecordMonthlyAgg.aggregate({
      where: { year, ...accessFilter },
      _sum: { amountSum: true, recordCount: true },
    });

    const prevYearAgg = await prisma.costRecordMonthlyAgg.aggregate({
      where: { year: year - 1, ...accessFilter },
      _sum: { amountSum: true },
    });

    const monthAgg = await prisma.costRecordMonthlyAgg.aggregate({
      where: { year, month: currentMonth, ...accessFilter },
      _sum: { amountSum: true },
    });

    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthYear = currentMonth === 1 ? year - 1 : year;
    const prevMonthAgg = await prisma.costRecordMonthlyAgg.aggregate({
      where: { year: prevMonthYear, month: prevMonth, ...accessFilter },
      _sum: { amountSum: true },
    });

    const [openAnomalies, criticalAnomalies] = await Promise.all([
      prisma.anomaly.count({ where: { status: 'new', ...anomalyAccessFilter } }),
      prisma.anomaly.count({
        where: { status: 'new', severity: 'critical', ...anomalyAccessFilter },
      }),
    ]);

    const [totalDocuments, pendingDocuments] = await Promise.all([
      prisma.document.count(),
      prisma.document.count({ where: { extractionStatus: { in: ['pending', 'processing'] } } }),
    ]);

    const yearTotal = Number(yearAgg._sum.amountSum || 0);
    const prevYearTotal = Number(prevYearAgg._sum.amountSum || 0);
    const monthTotal = Number(monthAgg._sum.amountSum || 0);
    const prevMonthTotal = Number(prevMonthAgg._sum.amountSum || 0);

    const payload = {
      year,
      totals: {
        yearToDate: yearTotal,
        yearToDateChange:
          prevYearTotal > 0 ? ((yearTotal - prevYearTotal) / prevYearTotal) * 100 : 0,
        currentMonth: monthTotal,
        currentMonthChange:
          prevMonthTotal > 0 ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0,
        recordCount: yearAgg._sum.recordCount || 0,
      },
      anomalies: {
        open: openAnomalies,
        critical: criticalAnomalies,
      },
      documents: {
        total: totalDocuments,
        pending: pendingDocuments,
      },
    };

    analyticsCache.set(cacheKey, payload);
    reply.header('Cache-Control', ANALYTICS_CACHE_CONTROL);
    return reply.send(payload);
  });
}
