import type { FastifyInstance } from 'fastify';
import { buildAccessFilter, getUserRestrictions } from '../../lib/access-control.js';
import { prisma } from '../../lib/db.js';
import { sendBadRequest } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';
import type { MonthlyReportQuery } from './shared.js';

export async function registerMonthlyReportExportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: MonthlyReportQuery }>(
    '/monthly-report',
    { preHandler: requireRole('manager', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const yearStr = request.query.year;
      const monthStr = request.query.month;
      if (!yearStr || !monthStr) {
        return sendBadRequest(reply, 'Year and month are required');
      }

      const year = Number.parseInt(yearStr, 10);
      const month = Number.parseInt(monthStr, 10);
      if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
        return sendBadRequest(reply, 'Invalid year or month');
      }

      const aggWhere = { year, month, ...accessFilter };
      const anomalyWhere: Record<string, unknown> = {
        detectedAt: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      };
      if (restrictions.hasRestrictions) {
        anomalyWhere['costRecord'] = accessFilter;
      }

      const [byCostType, byLocation, bySupplier, anomalyCount] = await Promise.all([
        prisma.costRecordMonthlyAgg.groupBy({
          by: ['costType'],
          where: aggWhere,
          _sum: { amountSum: true, recordCount: true },
          orderBy: { _sum: { amountSum: 'desc' } },
        }),
        prisma.costRecordMonthlyAgg.groupBy({
          by: ['locationId'],
          where: aggWhere,
          _sum: { amountSum: true },
          orderBy: { _sum: { amountSum: 'desc' } },
          take: 10,
        }),
        prisma.costRecordMonthlyAgg.groupBy({
          by: ['supplierId'],
          where: aggWhere,
          _sum: { amountSum: true },
          orderBy: { _sum: { amountSum: 'desc' } },
          take: 10,
        }),
        prisma.anomaly.count({ where: anomalyWhere }),
      ]);

      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const [currentTotal, prevTotal] = await Promise.all([
        prisma.costRecordMonthlyAgg.aggregate({
          where: aggWhere,
          _sum: { amountSum: true },
        }),
        prisma.costRecordMonthlyAgg.aggregate({
          where: { year: prevYear, month: prevMonth, ...accessFilter },
          _sum: { amountSum: true },
        }),
      ]);

      const locationIds = byLocation
        .map((location) => location.locationId)
        .filter((id): id is string => id !== null);
      const supplierIds = bySupplier
        .map((supplier) => supplier.supplierId)
        .filter((id): id is string => id !== null);

      const [locations, suppliers] = await Promise.all([
        prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, name: true },
        }),
        prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true },
        }),
      ]);

      const locationMap = new Map(locations.map((location) => [location.id, location.name]));
      const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

      const current = Number(currentTotal._sum.amountSum || 0);
      const previous = Number(prevTotal._sum.amountSum || 0);

      return reply.send({
        period: { year, month },
        summary: {
          totalAmount: current,
          previousMonth: previous,
          changePercent: previous > 0 ? ((current - previous) / previous) * 100 : 0,
          anomalyCount,
        },
        byCostType: byCostType
          .filter((item) => item.costType)
          .map((item) => ({
            costType: item.costType,
            amount: Number(item._sum.amountSum || 0),
            recordCount: item._sum.recordCount || 0,
          })),
        byLocation: byLocation
          .filter((item) => item.locationId)
          .map((item) => ({
            locationId: item.locationId,
            locationName: locationMap.get(item.locationId!) || 'Unbekannt',
            amount: Number(item._sum.amountSum || 0),
          })),
        bySupplier: bySupplier
          .filter((item) => item.supplierId)
          .map((item) => ({
            supplierId: item.supplierId,
            supplierName: supplierMap.get(item.supplierId!) || 'Unbekannt',
            amount: Number(item._sum.amountSum || 0),
          })),
        generatedAt: new Date().toISOString(),
      });
    },
  );
}
