import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/db.js';
import { sendBadRequest } from '../lib/errors.js';
import { getUserRestrictions, buildAccessFilter } from '../lib/access-control.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireScope } from '../lib/api-key-scopes.js';

// Maximum records per export request
const MAX_EXPORT_LIMIT = 1000;

interface ExportQuery {
  year?: number;
  month?: number;
  costType?: string;
  locationId?: string;
  supplierId?: string;
  format?: 'csv' | 'json';
  limit?: number;
  offset?: number;
}

/**
 * Export routes for data export
 */
export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireScope('read:exports'));

  /**
   * GET /exports/cost-records
   * Requires manager or admin role
   */
  fastify.get<{ Querystring: ExportQuery }>(
    '/cost-records',
    { preHandler: requireRole('manager', 'admin') },
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const query = request.query as ExportQuery;
      const format = query.format || 'csv';
      const limit = Math.min(query.limit || MAX_EXPORT_LIMIT, MAX_EXPORT_LIMIT);
      const offset = query.offset || 0;

      const where: Record<string, unknown> = { ...accessFilter };

      if (query.year) {
        const startDate = new Date(query.year, (query.month || 1) - 1, 1);
        const endDate = query.month
          ? new Date(query.year, query.month, 0)
          : new Date(query.year, 11, 31);

        where['periodStart'] = { gte: startDate, lte: endDate };
      }

      if (query.costType) where['costType'] = query.costType;
      if (query.locationId) where['locationId'] = query.locationId;
      if (query.supplierId) where['supplierId'] = query.supplierId;

      const [records, total] = await Promise.all([
        prisma.costRecord.findMany({
          where,
          include: {
            location: { select: { name: true } },
            supplier: { select: { name: true } },
          },
          orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
          take: limit,
          skip: offset,
        }),
        prisma.costRecord.count({ where }),
      ]);

      if (format === 'json') {
        return reply.send({
          data: records.map((r) => ({
            id: r.id,
            periodStart: r.periodStart.toISOString().split('T')[0],
            periodEnd: r.periodEnd.toISOString().split('T')[0],
            costType: r.costType,
            amount: Number(r.amount),
            amountNet: r.amountNet ? Number(r.amountNet) : null,
            vatAmount: r.vatAmount ? Number(r.vatAmount) : null,
            quantity: r.quantity ? Number(r.quantity) : null,
            unit: r.unit,
            pricePerUnit: r.pricePerUnit ? Number(r.pricePerUnit) : null,
            invoiceNumber: r.invoiceNumber,
            location: r.location?.name || '',
            supplier: r.supplier?.name || '',
          })),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + records.length < total,
          },
          exportedAt: new Date().toISOString(),
          recordCount: records.length,
        });
      }

      // Generate CSV
      const headers = [
        'ID',
        'Periodenstart',
        'Periodenende',
        'Kostenart',
        'Betrag',
        'Nettobetrag',
        'MwSt',
        'Menge',
        'Einheit',
        'Preis/Einheit',
        'Rechnungsnummer',
        'Standort',
        'Lieferant',
      ];

      const csvRows = [headers.join(';')];

      for (const r of records) {
        const row = [
          r.id,
          r.periodStart.toISOString().split('T')[0],
          r.periodEnd.toISOString().split('T')[0],
          r.costType,
          Number(r.amount).toFixed(2).replace('.', ','),
          r.amountNet ? Number(r.amountNet).toFixed(2).replace('.', ',') : '',
          r.vatAmount ? Number(r.vatAmount).toFixed(2).replace('.', ',') : '',
          r.quantity ? Number(r.quantity).toString().replace('.', ',') : '',
          r.unit || '',
          r.pricePerUnit ? Number(r.pricePerUnit).toFixed(4).replace('.', ',') : '',
          r.invoiceNumber || '',
          r.location?.name || '',
          r.supplier?.name || '',
        ];
        csvRows.push(row.map((v) => `"${v}"`).join(';'));
      }

      const csv = '\uFEFF' + csvRows.join('\n');
      const filename = `kostendaten_${new Date().toISOString().split('T')[0]}.csv`;

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    }
  );

  /**
   * GET /exports/anomalies
   * Requires manager or admin role
   */
  fastify.get<{ Querystring: { status?: string; severity?: string; format?: string; limit?: number; offset?: number } }>(
    '/anomalies',
    { preHandler: requireRole('manager', 'admin') },
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const { status, severity, format = 'csv' } = request.query;
      const limit = Math.min(request.query.limit || MAX_EXPORT_LIMIT, MAX_EXPORT_LIMIT);
      const offset = request.query.offset || 0;

      // Build where clause with access filtering on related cost record
      const where: Record<string, unknown> = {};
      if (status) where['status'] = status;
      if (severity) where['severity'] = severity;

      // Apply access filter on cost record if user has restrictions
      if (restrictions.hasRestrictions) {
        where['costRecord'] = accessFilter;
      }

      const [anomalies, total] = await Promise.all([
        prisma.anomaly.findMany({
          where,
          include: {
            costRecord: {
              include: {
                location: { select: { name: true } },
                supplier: { select: { name: true } },
              },
            },
          },
          orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
          take: limit,
          skip: offset,
        }),
        prisma.anomaly.count({ where }),
      ]);

      if (format === 'json') {
        return reply.send({
          data: anomalies.map((a) => ({
            id: a.id,
            type: a.type,
            severity: a.severity,
            status: a.status,
            message: a.message,
            detectedAt: a.detectedAt.toISOString(),
            acknowledgedAt: a.acknowledgedAt?.toISOString() || null,
            costRecordAmount: a.costRecord ? Number(a.costRecord.amount) : null,
            location: a.costRecord?.location?.name || '',
            supplier: a.costRecord?.supplier?.name || '',
          })),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + anomalies.length < total,
          },
          exportedAt: new Date().toISOString(),
          recordCount: anomalies.length,
        });
      }

      const headers = [
        'ID',
        'Typ',
        'Schweregrad',
        'Status',
        'Nachricht',
        'Erkannt am',
        'Bestätigt am',
        'Betrag',
        'Standort',
        'Lieferant',
      ];

      const csvRows = [headers.join(';')];

      for (const a of anomalies) {
        const row = [
          a.id,
          a.type,
          a.severity,
          a.status,
          a.message.replace(/"/g, '""'),
          a.detectedAt.toISOString().split('T')[0],
          a.acknowledgedAt?.toISOString().split('T')[0] || '',
          a.costRecord ? Number(a.costRecord.amount).toFixed(2).replace('.', ',') : '',
          a.costRecord?.location?.name || '',
          a.costRecord?.supplier?.name || '',
        ];
        csvRows.push(row.map((v) => `"${v}"`).join(';'));
      }

      const csv = '\uFEFF' + csvRows.join('\n');
      const filename = `anomalien_${new Date().toISOString().split('T')[0]}.csv`;

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    }
  );

  /**
   * GET /exports/monthly-report
   * Requires manager or admin role
   */
  fastify.get<{ Querystring: { year: string; month: string } }>(
    '/monthly-report',
    { preHandler: requireRole('manager', 'admin') },
    async (request, reply) => {
      const user = request.user!;

      // Get user's access restrictions
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const yearStr = request.query.year;
      const monthStr = request.query.month;
      if (!yearStr || !monthStr) {
        return sendBadRequest(reply, 'Year and month are required');
      }

      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return sendBadRequest(reply, 'Invalid year or month');
      }

      // Build where clause with access filter
      const aggWhere = { year, month, ...accessFilter };

      // Build anomaly access filter
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
        .map((l) => l.locationId)
        .filter((id): id is string => id !== null);
      const supplierIds = bySupplier
        .map((s) => s.supplierId)
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

      const locationMap = new Map(locations.map((l) => [l.id, l.name]));
      const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

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
          .filter((c) => c.costType)
          .map((c) => ({
            costType: c.costType,
            amount: Number(c._sum.amountSum || 0),
            recordCount: c._sum.recordCount || 0,
          })),
        byLocation: byLocation
          .filter((l) => l.locationId)
          .map((l) => ({
            locationId: l.locationId,
            locationName: locationMap.get(l.locationId!) || 'Unbekannt',
            amount: Number(l._sum.amountSum || 0),
          })),
        bySupplier: bySupplier
          .filter((s) => s.supplierId)
          .map((s) => ({
            supplierId: s.supplierId,
            supplierName: supplierMap.get(s.supplierId!) || 'Unbekannt',
            amount: Number(s._sum.amountSum || 0),
          })),
        generatedAt: new Date().toISOString(),
      });
    }
  );
};

export default exportRoutes;
