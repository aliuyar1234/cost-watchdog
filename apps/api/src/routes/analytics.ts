import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/db.js';
import { parseQueryInt } from '../lib/validators.js';
import { getUserRestrictions, buildAccessFilter } from '../lib/access-control.js';
import { authenticate } from '../middleware/auth.js';
import { requireScope } from '../lib/api-key-scopes.js';

interface DashboardQuery {
  year?: string;
  locationId?: string;
}

interface TrendsQuery {
  months?: string;
  costType?: string;
  locationId?: string;
  supplierId?: string;
}

interface BreakdownQuery {
  year?: string;
  month?: string;
  limit?: string;
}

/**
 * Analytics routes for dashboard and reporting
 */
export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth and scope check to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireScope('read:analytics'));

  /**
   * GET /analytics/dashboard - Main dashboard KPIs
   */
  fastify.get<{ Querystring: DashboardQuery }>(
    '/dashboard',
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const query = request.query as DashboardQuery;
      const year = parseQueryInt(query.year, new Date().getFullYear());
      const currentMonth = new Date().getMonth() + 1;

      // Get current year totals (with access filter)
      const yearAgg = await prisma.costRecordMonthlyAgg.aggregate({
        where: { year, ...accessFilter },
        _sum: { amountSum: true, recordCount: true },
      });

      // Get previous year totals
      const prevYearAgg = await prisma.costRecordMonthlyAgg.aggregate({
        where: { year: year - 1, ...accessFilter },
        _sum: { amountSum: true },
      });

      // Get current month totals
      const monthAgg = await prisma.costRecordMonthlyAgg.aggregate({
        where: { year, month: currentMonth, ...accessFilter },
        _sum: { amountSum: true },
      });

      // Get previous month
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevMonthYear = currentMonth === 1 ? year - 1 : year;
      const prevMonthAgg = await prisma.costRecordMonthlyAgg.aggregate({
        where: { year: prevMonthYear, month: prevMonth, ...accessFilter },
        _sum: { amountSum: true },
      });

      // Get anomaly counts (filtered by accessible cost records)
      const anomalyAccessFilter = restrictions.hasRestrictions
        ? { costRecord: accessFilter }
        : {};
      const [openAnomalies, criticalAnomalies] = await Promise.all([
        prisma.anomaly.count({ where: { status: 'new', ...anomalyAccessFilter } }),
        prisma.anomaly.count({ where: { status: 'new', severity: 'critical', ...anomalyAccessFilter } }),
      ]);

      // Get document stats (documents are not location-filtered for now)
      const [totalDocuments, pendingDocuments] = await Promise.all([
        prisma.document.count(),
        prisma.document.count({ where: { extractionStatus: { in: ['pending', 'processing'] } } }),
      ]);

      const yearTotal = Number(yearAgg._sum.amountSum || 0);
      const prevYearTotal = Number(prevYearAgg._sum.amountSum || 0);
      const monthTotal = Number(monthAgg._sum.amountSum || 0);
      const prevMonthTotal = Number(prevMonthAgg._sum.amountSum || 0);

      return reply.send({
        year,
        totals: {
          yearToDate: yearTotal,
          yearToDateChange: prevYearTotal > 0
            ? ((yearTotal - prevYearTotal) / prevYearTotal) * 100
            : 0,
          currentMonth: monthTotal,
          currentMonthChange: prevMonthTotal > 0
            ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100
            : 0,
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
      });
    }
  );

  /**
   * GET /analytics/trends - Cost trends over time
   */
  fastify.get<{ Querystring: TrendsQuery }>(
    '/trends',
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const query = request.query as TrendsQuery;
      const months = Math.min(parseQueryInt(query.months, 12), 36);

      const where: Record<string, unknown> = { ...accessFilter };
      if (query.costType) where['costType'] = query.costType;
      if (query.locationId) where['locationId'] = query.locationId;
      if (query.supplierId) where['supplierId'] = query.supplierId;

      // Use groupBy to aggregate all records per year-month
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

      return reply.send({ data: result });
    }
  );

  /**
   * GET /analytics/by-cost-type
   */
  fastify.get<{ Querystring: BreakdownQuery }>(
    '/by-cost-type',
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const query = request.query as BreakdownQuery;
      const year = parseQueryInt(query.year, new Date().getFullYear());
      const limit = parseQueryInt(query.limit, 10);
      const month = query.month ? parseInt(query.month, 10) : undefined;

      const where: Record<string, unknown> = { year, ...accessFilter };
      if (month) where['month'] = month;

      const data = await prisma.costRecordMonthlyAgg.groupBy({
        by: ['costType'],
        where,
        _sum: { amountSum: true, recordCount: true },
        orderBy: { _sum: { amountSum: 'desc' } },
        take: limit,
      });

      const total = data.reduce((sum, item) => sum + Number(item._sum.amountSum || 0), 0);

      const breakdown = data
        .filter(item => item.costType)
        .map(item => ({
          costType: item.costType,
          amount: Number(item._sum.amountSum || 0),
          recordCount: item._sum.recordCount || 0,
          percentage: total > 0 ? (Number(item._sum.amountSum || 0) / total) * 100 : 0,
        }));

      return reply.send({ data: breakdown });
    }
  );

  /**
   * GET /analytics/by-location
   */
  fastify.get<{ Querystring: BreakdownQuery }>(
    '/by-location',
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const query = request.query as BreakdownQuery;
      const year = parseQueryInt(query.year, new Date().getFullYear());
      const limit = parseQueryInt(query.limit, 10);
      const month = query.month ? parseInt(query.month, 10) : undefined;

      const where: Record<string, unknown> = { year, ...accessFilter };
      if (month) where['month'] = month;

      const data = await prisma.costRecordMonthlyAgg.groupBy({
        by: ['locationId'],
        where,
        _sum: { amountSum: true, recordCount: true },
        orderBy: { _sum: { amountSum: 'desc' } },
        take: limit,
      });

      const locationIds = data
        .map(d => d.locationId)
        .filter((id): id is string => id !== null);

      const locations = await prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true, type: true },
      });

      const locationMap = new Map(locations.map(l => [l.id, l]));
      const total = data.reduce((sum, item) => sum + Number(item._sum.amountSum || 0), 0);

      const breakdown = data
        .filter(item => item.locationId)
        .map(item => {
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

      return reply.send({ data: breakdown });
    }
  );

  /**
   * GET /analytics/by-supplier
   */
  fastify.get<{ Querystring: BreakdownQuery }>(
    '/by-supplier',
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const query = request.query as BreakdownQuery;
      const year = parseQueryInt(query.year, new Date().getFullYear());
      const limit = parseQueryInt(query.limit, 10);
      const month = query.month ? parseInt(query.month, 10) : undefined;

      const where: Record<string, unknown> = { year, ...accessFilter };
      if (month) where['month'] = month;

      const data = await prisma.costRecordMonthlyAgg.groupBy({
        by: ['supplierId'],
        where,
        _sum: { amountSum: true, recordCount: true },
        orderBy: { _sum: { amountSum: 'desc' } },
        take: limit,
      });

      const supplierIds = data
        .map(d => d.supplierId)
        .filter((id): id is string => id !== null);

      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: supplierIds } },
        select: { id: true, name: true, category: true },
      });

      const supplierMap = new Map(suppliers.map(s => [s.id, s]));
      const total = data.reduce((sum, item) => sum + Number(item._sum.amountSum || 0), 0);

      const breakdown = data
        .filter(item => item.supplierId)
        .map(item => {
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

      return reply.send({ data: breakdown });
    }
  );

  /**
   * GET /analytics/comparison - Year-over-year comparison
   */
  fastify.get<{ Querystring: { year?: string; costType?: string } }>(
    '/comparison',
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const year = parseQueryInt(request.query.year, new Date().getFullYear());
      const costType = request.query.costType;

      const where: Record<string, unknown> = { ...accessFilter };
      if (costType) where['costType'] = costType;

      // Get current year by month
      const currentYear = await prisma.costRecordMonthlyAgg.groupBy({
        by: ['month'],
        where: { ...where, year },
        _sum: { amountSum: true },
        orderBy: { month: 'asc' },
      });

      // Get previous year by month
      const previousYear = await prisma.costRecordMonthlyAgg.groupBy({
        by: ['month'],
        where: { ...where, year: year - 1 },
        _sum: { amountSum: true },
        orderBy: { month: 'asc' },
      });

      const currentMap = new Map(currentYear.map(d => [d.month, Number(d._sum.amountSum || 0)]));
      const previousMap = new Map(previousYear.map(d => [d.month, Number(d._sum.amountSum || 0)]));

      const months = [];
      for (let m = 1; m <= 12; m++) {
        const current = currentMap.get(m) || 0;
        const previous = previousMap.get(m) || 0;
        months.push({
          month: m,
          currentYear: current,
          previousYear: previous,
          change: previous > 0 ? ((current - previous) / previous) * 100 : 0,
        });
      }

      return reply.send({ year, months });
    }
  );
};

export default analyticsRoutes;
