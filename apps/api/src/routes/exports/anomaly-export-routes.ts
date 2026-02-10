import type { FastifyInstance } from 'fastify';
import { buildAccessFilter, getUserRestrictions } from '../../lib/access-control.js';
import { prisma } from '../../lib/db.js';
import { requireRole } from '../../middleware/auth.js';
import {
  MAX_EXPORT_LIMIT,
  AnomalyExportQuery,
  formatCsvNumber,
  toCsvRow,
  toIsoDate,
} from './shared.js';

export async function registerAnomalyExportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: AnomalyExportQuery }>(
    '/anomalies',
    { preHandler: requireRole('manager', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const restrictions = await getUserRestrictions(user.sub);
      const accessFilter = buildAccessFilter(restrictions);

      const { status, severity, format = 'csv' } = request.query;
      const limit = Math.min(request.query.limit || MAX_EXPORT_LIMIT, MAX_EXPORT_LIMIT);
      const offset = request.query.offset || 0;

      const where: Record<string, unknown> = {};
      if (status) where['status'] = status;
      if (severity) where['severity'] = severity;
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
          data: anomalies.map((anomaly) => ({
            id: anomaly.id,
            type: anomaly.type,
            severity: anomaly.severity,
            status: anomaly.status,
            message: anomaly.message,
            detectedAt: anomaly.detectedAt.toISOString(),
            acknowledgedAt: anomaly.acknowledgedAt?.toISOString() || null,
            costRecordAmount: anomaly.costRecord ? Number(anomaly.costRecord.amount) : null,
            location: anomaly.costRecord?.location?.name || '',
            supplier: anomaly.costRecord?.supplier?.name || '',
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
        'Bestaetigt am',
        'Betrag',
        'Standort',
        'Lieferant',
      ];
      const csvRows = [headers.join(';')];

      for (const anomaly of anomalies) {
        csvRows.push(
          toCsvRow([
            anomaly.id,
            anomaly.type,
            anomaly.severity,
            anomaly.status,
            anomaly.message,
            toIsoDate(anomaly.detectedAt),
            anomaly.acknowledgedAt ? toIsoDate(anomaly.acknowledgedAt) : '',
            anomaly.costRecord ? formatCsvNumber(Number(anomaly.costRecord.amount), 2) : '',
            anomaly.costRecord?.location?.name || '',
            anomaly.costRecord?.supplier?.name || '',
          ]),
        );
      }

      const csv = '\uFEFF' + csvRows.join('\n');
      const filename = `anomalien_${toIsoDate(new Date())}.csv`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    },
  );
}
