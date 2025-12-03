export { yoyDeviationCheck } from './yoy-deviation';
export { momDeviationCheck } from './mom-deviation';
export { pricePerUnitCheck } from './price-per-unit';
export { statisticalOutlierCheck } from './statistical-outlier';
export { duplicateCheck } from './duplicate-detection';
export { missingPeriodCheck } from './missing-period';
export { seasonalAnomalyCheck } from './seasonal-anomaly';
export { budgetExceededCheck } from './budget-exceeded';

import type { AnomalyCheck } from '../types';
import { yoyDeviationCheck } from './yoy-deviation';
import { momDeviationCheck } from './mom-deviation';
import { pricePerUnitCheck } from './price-per-unit';
import { statisticalOutlierCheck } from './statistical-outlier';
import { duplicateCheck } from './duplicate-detection';
import { missingPeriodCheck } from './missing-period';
import { seasonalAnomalyCheck } from './seasonal-anomaly';
import { budgetExceededCheck } from './budget-exceeded';

/**
 * All available anomaly checks
 */
export const ALL_CHECKS: AnomalyCheck[] = [
  yoyDeviationCheck,
  momDeviationCheck,
  pricePerUnitCheck,
  statisticalOutlierCheck,
  duplicateCheck,
  missingPeriodCheck,
  seasonalAnomalyCheck,
  budgetExceededCheck,
];

/**
 * Get a check by its ID
 */
export function getCheckById(id: string): AnomalyCheck | undefined {
  return ALL_CHECKS.find(check => check.id === id);
}

/**
 * Get all check IDs
 */
export function getAllCheckIds(): string[] {
  return ALL_CHECKS.map(check => check.id);
}
