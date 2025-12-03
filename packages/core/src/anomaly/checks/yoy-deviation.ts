import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';

/**
 * Year-over-Year Deviation Check
 *
 * Compares the current cost record with the same month in the previous year.
 * Triggers when deviation exceeds threshold (default 20%).
 */
export const yoyDeviationCheck: AnomalyCheck = {
  id: 'yoy_deviation',
  name: 'Jahr-über-Jahr Abweichung',
  description: 'Vergleicht mit dem gleichen Monat im Vorjahr',
  applicableCostTypes: 'all',
  minHistoricalMonths: 12,

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Find the record from the same month last year
    const lastYear = context.historicalRecords.find(r =>
      r.periodStart.getMonth() === record.periodStart.getMonth() &&
      r.periodStart.getFullYear() === record.periodStart.getFullYear() - 1 &&
      r.costType === record.costType
    );

    if (!lastYear) {
      return { triggered: false };
    }

    // Avoid division by zero
    if (lastYear.amount === 0) {
      return { triggered: false };
    }

    const deviation = ((record.amount - lastYear.amount) / lastYear.amount) * 100;
    const threshold = context.settings.alertThresholds.yoyDeviationPercent;

    if (Math.abs(deviation) > threshold) {
      const severity = Math.abs(deviation) > threshold * 2 ? 'critical' : 'warning';
      const deviationAbsolute = record.amount - lastYear.amount;

      return {
        triggered: true,
        severity,
        message: `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}% vs. Vorjahresmonat (${deviation > 0 ? '+' : ''}€${deviationAbsolute.toFixed(2)})`,
        details: {
          expectedValue: lastYear.amount,
          actualValue: record.amount,
          deviationPercent: deviation,
          deviationAbsolute,
          comparisonPeriod: lastYear.periodStart.toISOString(),
          comparisonRecordId: lastYear.id,
          threshold,
          method: 'yoy_comparison',
        },
      };
    }

    return { triggered: false };
  },
};
