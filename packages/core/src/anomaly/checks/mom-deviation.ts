import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';

/**
 * Month-over-Month Deviation Check
 *
 * Compares the current cost record with the previous month.
 * Triggers when deviation exceeds threshold (default 30%).
 */
export const momDeviationCheck: AnomalyCheck = {
  id: 'mom_deviation',
  name: 'Monat-über-Monat Abweichung',
  description: 'Vergleicht mit dem Vormonat',
  applicableCostTypes: 'all',
  minHistoricalMonths: 1,

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Get the most recent record of the same cost type (before current record)
    const sameTypeRecords = context.historicalRecords
      .filter(r =>
        r.costType === record.costType &&
        r.periodStart.getTime() < record.periodStart.getTime()
      )
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());

    const lastMonth = sameTypeRecords[0];

    if (!lastMonth) {
      return { triggered: false };
    }

    // Avoid division by zero
    if (lastMonth.amount === 0) {
      return { triggered: false };
    }

    const deviation = ((record.amount - lastMonth.amount) / lastMonth.amount) * 100;
    const threshold = context.settings.alertThresholds.momDeviationPercent;

    if (Math.abs(deviation) > threshold) {
      const severity = Math.abs(deviation) > threshold * 2 ? 'critical' : 'warning';
      const deviationAbsolute = record.amount - lastMonth.amount;

      return {
        triggered: true,
        severity,
        message: `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}% vs. Vormonat (${deviation > 0 ? '+' : ''}€${deviationAbsolute.toFixed(2)})`,
        details: {
          expectedValue: lastMonth.amount,
          actualValue: record.amount,
          deviationPercent: deviation,
          deviationAbsolute,
          comparisonPeriod: lastMonth.periodStart.toISOString(),
          comparisonRecordId: lastMonth.id,
          threshold,
          method: 'mom_comparison',
        },
      };
    }

    return { triggered: false };
  },
};
