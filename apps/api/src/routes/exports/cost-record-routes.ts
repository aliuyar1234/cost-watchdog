import type { FastifyInstance } from 'fastify';
import { buildAccessFilter, getUserRestrictions } from '../../lib/access-control.js';
import { prisma } from '../../lib/db.js';
import { requireRole } from '../../middleware/auth.js';
import { MAX_EXPORT_LIMIT, ExportQuery, formatCsvNumber, toCsvRow, toIsoDate } from './shared.js';

export async function registerCostRecordExportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ExportQuery }>(
    '/cost-records',
    { preHandler: requireRole('manager', 'admin') },
    async (request, reply) => {
      const user = request.user!;
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
          data: records.map((record) => ({
            id: record.id,
            periodStart: toIsoDate(record.periodStart),
            periodEnd: toIsoDate(record.periodEnd),
            costType: record.costType,
            amount: Number(record.amount),
            amountNet: record.amountNet ? Number(record.amountNet) : null,
            vatAmount: record.vatAmount ? Number(record.vatAmount) : null,
            quantity: record.quantity ? Number(record.quantity) : null,
            unit: record.unit,
            pricePerUnit: record.pricePerUnit ? Number(record.pricePerUnit) : null,
            invoiceNumber: record.invoiceNumber,
            location: record.location?.name || '',
            supplier: record.supplier?.name || '',
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
      for (const record of records) {
        csvRows.push(
          toCsvRow([
            record.id,
            toIsoDate(record.periodStart),
            toIsoDate(record.periodEnd),
            record.costType,
            formatCsvNumber(Number(record.amount), 2),
            record.amountNet ? formatCsvNumber(Number(record.amountNet), 2) : '',
            record.vatAmount ? formatCsvNumber(Number(record.vatAmount), 2) : '',
            record.quantity ? String(Number(record.quantity)).replace('.', ',') : '',
            record.unit || '',
            record.pricePerUnit ? formatCsvNumber(Number(record.pricePerUnit), 4) : '',
            record.invoiceNumber || '',
            record.location?.name || '',
            record.supplier?.name || '',
          ]),
        );
      }

      const csv = '\uFEFF' + csvRows.join('\n');
      const filename = `kostendaten_${toIsoDate(new Date())}.csv`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    },
  );
}
