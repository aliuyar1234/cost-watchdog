import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';
import type { CostType } from '../../types';

/**
 * Cost types that typically have seasonal patterns
 */
const SEASONAL_COST_TYPES: CostType[] = [
  'electricity',
  'natural_gas',
  'district_heating',
  'water',
];

/**
 * Define seasonal patterns for different cost types
 * Values represent expected relative consumption multipliers by month (0-11)
 * 1.0 = average, 1.3 = 30% above average, 0.7 = 30% below average
 */
const SEASONAL_PATTERNS: Partial<Record<CostType, number[]>> = {
  // Heating costs: high in winter, low in summer
  natural_gas: [1.4, 1.3, 1.1, 0.8, 0.6, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.4],
  district_heating: [1.4, 1.3, 1.1, 0.8, 0.6, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.4],

  // Electricity: slightly higher in winter (heating/lighting) and summer (AC)
  electricity: [1.1, 1.1, 1.0, 0.9, 0.9, 1.0, 1.1, 1.1, 1.0, 0.95, 1.0, 1.1],

  // Water: higher in summer (gardens, cooling)
  water: [0.9, 0.9, 1.0, 1.0, 1.1, 1.2, 1.2, 1.2, 1.1, 1.0, 0.9, 0.9],
};

/**
 * Threshold for seasonal deviation (50% more than seasonally expected)
 */
const SEASONAL_THRESHOLD = 0.5;

/**
 * Seasonal Anomaly Check
 *
 * Detects when costs deviate significantly from expected seasonal patterns.
 * For example, high heating costs in summer or low electricity in winter.
 */
export const seasonalAnomalyCheck: AnomalyCheck = {
  id: 'seasonal_anomaly',
  name: 'Saisonale Anomalie',
  description: 'Erkennt ungewöhnliche Abweichungen von saisonalen Mustern',
  applicableCostTypes: SEASONAL_COST_TYPES,
  minHistoricalMonths: 12,

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Get seasonal pattern for this cost type
    const seasonalPattern = SEASONAL_PATTERNS[record.costType];
    if (!seasonalPattern) {
      return { triggered: false };
    }

    // Calculate historical average for this cost type
    const historicalAmounts = context.historicalRecords
      .filter(r =>
        r.costType === record.costType &&
        r.periodStart.getTime() < record.periodStart.getTime()
      )
      .map(r => r.amount);

    if (historicalAmounts.length < 12) {
      return { triggered: false };
    }

    const overallAverage = historicalAmounts.reduce((sum, val) => sum + val, 0) / historicalAmounts.length;

    if (overallAverage === 0) {
      return { triggered: false };
    }

    // Get expected seasonal multiplier for current month
    const month = record.periodStart.getMonth();
    const seasonalMultiplier = seasonalPattern[month] ?? 1.0;
    const expectedAmount = overallAverage * seasonalMultiplier;

    // Calculate deviation from seasonally expected amount
    const deviation = (record.amount - expectedAmount) / expectedAmount;

    if (Math.abs(deviation) > SEASONAL_THRESHOLD) {
      const isHigher = deviation > 0;
      const seasonName = getSeasonName(month);

      return {
        triggered: true,
        severity: 'info',
        message: isHigher
          ? `Ungewöhnlich hohe Kosten für ${seasonName} (+${(deviation * 100).toFixed(1)}% über Saisonerwartung)`
          : `Ungewöhnlich niedrige Kosten für ${seasonName} (${(deviation * 100).toFixed(1)}% unter Saisonerwartung)`,
        details: {
          expectedValue: expectedAmount,
          actualValue: record.amount,
          overallAverage,
          seasonalMultiplier,
          deviationPercent: deviation * 100,
          month,
          season: seasonName,
          method: 'seasonal_pattern',
        },
      };
    }

    return { triggered: false };
  },
};

/**
 * Get German season name for a given month
 */
function getSeasonName(month: number): string {
  if (month >= 2 && month <= 4) return 'Frühling';
  if (month >= 5 && month <= 7) return 'Sommer';
  if (month >= 8 && month <= 10) return 'Herbst';
  return 'Winter';
}
