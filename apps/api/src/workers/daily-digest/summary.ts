import { prisma } from '../../lib/db.js';
import type { DigestSummary } from './types.js';

function formatDigestDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getEnabledSeverities(settings: {
  notifyOnCritical: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
}): string[] {
  const severities: string[] = [];
  if (settings.notifyOnCritical) severities.push('critical');
  if (settings.notifyOnWarning) severities.push('warning');
  if (settings.notifyOnInfo) severities.push('info');
  return severities;
}

export async function buildDigestSummary(
  windowStart: Date,
  windowEnd: Date,
  enabledSeverities: string[],
): Promise<DigestSummary> {
  if (enabledSeverities.length === 0) {
    return {
      date: formatDigestDate(windowEnd),
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      topAnomalies: [],
    };
  }

  const whereClause = {
    detectedAt: { gte: windowStart, lt: windowEnd },
    isBackfill: false,
    severity: { in: enabledSeverities },
  };

  const [counts, anomalies] = await Promise.all([
    prisma.anomaly.groupBy({
      by: ['severity'],
      where: whereClause,
      _count: { _all: true },
    }),
    prisma.anomaly.findMany({
      where: whereClause,
      select: {
        type: true,
        severity: true,
        message: true,
        costRecord: { select: { amount: true } },
      },
    }),
  ]);

  const countMap = new Map(counts.map((row) => [row.severity, row._count._all]));
  const severityRank: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  const topAnomalies = anomalies
    .sort((a, b) => {
      const rankA = severityRank[a.severity] ?? 99;
      const rankB = severityRank[b.severity] ?? 99;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return Number(b.costRecord.amount) - Number(a.costRecord.amount);
    })
    .slice(0, 5)
    .map((anomaly) => ({
      type: anomaly.type,
      severity: anomaly.severity,
      message: anomaly.message,
      amount: Number(anomaly.costRecord.amount),
    }));

  return {
    date: formatDigestDate(windowEnd),
    criticalCount: countMap.get('critical') ?? 0,
    warningCount: countMap.get('warning') ?? 0,
    infoCount: countMap.get('info') ?? 0,
    topAnomalies,
  };
}
