import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';
import type { CostType } from '../../types';

/**
 * Cost types that have meaningful price per unit values
 */
const APPLICABLE_COST_TYPES: CostType[] = [
  'electricity',
  'natural_gas',
  'water',
  'fuel_diesel',
  'fuel_petrol',
  'district_heating',
];

/**
 * Price per Unit Spike Check
 *
 * Detects unusual price increases per unit compared to the 6-month average.
 * Triggers when price exceeds threshold (default 10% above average).
 */
export const pricePerUnitCheck: AnomalyCheck = {
  id: 'price_per_unit_spike',
  name: 'Preis pro Einheit Anstieg',
  description: 'Erkennt ungewöhnliche Preiserhöhungen pro Einheit',
  applicableCostTypes: APPLICABLE_COST_TYPES,
  minHistoricalMonths: 3,

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Skip if no price per unit or quantity
    if (!record.pricePerUnit || !record.quantity) {
      return { triggered: false };
    }

    // Get recent records with price per unit data (last 6 months)
    const recentRecords = context.historicalRecords
      .filter(r =>
        r.costType === record.costType &&
        r.pricePerUnit != null &&
        r.pricePerUnit > 0 &&
        r.periodStart.getTime() < record.periodStart.getTime()
      )
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
      .slice(0, 6);

    // Need at least 3 records for meaningful average
    if (recentRecords.length < 3) {
      return { triggered: false };
    }

    // Calculate average price
    const avgPrice = recentRecords.reduce((sum, r) => sum + r.pricePerUnit!, 0) / recentRecords.length;

    // Avoid division by zero
    if (avgPrice === 0) {
      return { triggered: false };
    }

    const deviation = ((record.pricePerUnit - avgPrice) / avgPrice) * 100;
    const threshold = context.settings.alertThresholds.pricePerUnitDeviationPercent;

    // Only trigger for price increases (positive deviation)
    if (deviation > threshold) {
      const severity = deviation > threshold * 2 ? 'critical' : 'warning';
      const priceIncrease = record.pricePerUnit - avgPrice;

      return {
        triggered: true,
        severity,
        message: `Preis/Einheit +${deviation.toFixed(1)}% über 6-Monats-Durchschnitt (+€${priceIncrease.toFixed(4)}/${record.unit || 'Einheit'})`,
        details: {
          expectedValue: avgPrice,
          actualValue: record.pricePerUnit,
          deviationPercent: deviation,
          priceIncrease,
          unit: record.unit,
          samplesUsed: recentRecords.length,
          threshold,
          method: 'price_per_unit_avg',
        },
      };
    }

    return { triggered: false };
  },
};
