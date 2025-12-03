import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';

/**
 * Calculate mean of an array of numbers
 */
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation of an array of numbers
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Statistical Outlier Check (Z-Score)
 *
 * Detects statistically unusual amounts using z-score analysis.
 * Triggers when z-score exceeds threshold (default 2 standard deviations).
 */
export const statisticalOutlierCheck: AnomalyCheck = {
  id: 'statistical_outlier',
  name: 'Statistischer Ausreißer',
  description: 'Erkennt statistisch ungewöhnliche Beträge mittels Z-Score',
  applicableCostTypes: 'all',
  minHistoricalMonths: 6,

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Get amounts from historical records of the same cost type
    const amounts = context.historicalRecords
      .filter(r =>
        r.costType === record.costType &&
        r.periodStart.getTime() < record.periodStart.getTime()
      )
      .map(r => r.amount);

    // Need at least 6 data points for meaningful statistical analysis
    if (amounts.length < 6) {
      return { triggered: false };
    }

    const mean = calculateMean(amounts);
    const stdDev = calculateStdDev(amounts, mean);

    // Can't calculate z-score with zero standard deviation
    if (stdDev === 0) {
      return { triggered: false };
    }

    const zScore = (record.amount - mean) / stdDev;
    const threshold = context.settings.alertThresholds.zScoreThreshold;

    if (Math.abs(zScore) > threshold) {
      const severity = Math.abs(zScore) > 3 ? 'critical' : 'warning';
      const deviationAbsolute = record.amount - mean;

      return {
        triggered: true,
        severity,
        message: `Statistisch ungewöhnlich: ${zScore.toFixed(1)} Standardabweichungen vom Mittelwert`,
        details: {
          expectedValue: mean,
          actualValue: record.amount,
          zScore,
          standardDeviation: stdDev,
          deviationAbsolute,
          samplesUsed: amounts.length,
          threshold,
          method: 'zscore',
        },
      };
    }

    return { triggered: false };
  },
};
