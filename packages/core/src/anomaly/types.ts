import type { CostType, AnomalySeverity, AnomalyStatus } from '../types';

// Re-export from core types
export type { AnomalySeverity, AnomalyStatus } from '../types';

/**
 * Result from running an anomaly check
 */
export interface CheckResult {
  triggered: boolean;
  severity?: AnomalySeverity;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Historical cost record for context (simplified for checks)
 */
export interface HistoricalCostRecord {
  id: string;
  costType: CostType;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  pricePerUnit?: number | null;
  periodStart: Date;
  periodEnd: Date;
  supplierId: string;
  invoiceNumber?: string | null;
}

/**
 * Contract information for context
 */
export interface ContractContext {
  id: string;
  supplierId: string;
  pricePerUnit?: number | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  validFrom: Date;
  validTo?: Date | null;
}

/**
 * Budget information for context
 */
export interface BudgetContext {
  id: string;
  costType: CostType;
  year: number;
  month?: number | null;
  amount: number;
}

/**
 * Settings relevant for anomaly detection
 */
export interface AnomalySettings {
  alertThresholds: {
    yoyDeviationPercent: number;
    momDeviationPercent: number;
    pricePerUnitDeviationPercent: number;
    zScoreThreshold: number;
    budgetExceededPercent: number;
  };
  enabledChecks: string[];
  maxAlertsPerDay: number;
  digestEnabled: boolean;
  digestHour: number;
}

/**
 * Default settings for anomaly detection
 */
export const DEFAULT_ANOMALY_SETTINGS: AnomalySettings = {
  alertThresholds: {
    yoyDeviationPercent: 20,
    momDeviationPercent: 30,
    pricePerUnitDeviationPercent: 10,
    zScoreThreshold: 2,
    budgetExceededPercent: 10,
  },
  enabledChecks: [
    'yoy_deviation',
    'mom_deviation',
    'price_per_unit_spike',
    'statistical_outlier',
    'duplicate_detection',
    'missing_period',
    'seasonal_anomaly',
    'budget_exceeded',
  ],
  maxAlertsPerDay: 50,
  digestEnabled: false,
  digestHour: 8,
};

/**
 * Location information for context
 */
export interface LocationContext {
  id: string;
  name: string;
  type: string;
}

/**
 * Supplier information for context
 */
export interface SupplierContext {
  id: string;
  name: string;
  category: string;
}

/**
 * Full context provided to anomaly checks
 */
export interface CheckContext {
  location: LocationContext;
  supplier: SupplierContext;
  historicalRecords: HistoricalCostRecord[];
  contract?: ContractContext;
  budget?: BudgetContext;
  settings: AnomalySettings;
}

/**
 * The current cost record being checked
 */
export interface CostRecordToCheck {
  id: string;
  locationId: string;
  supplierId: string;
  costType: CostType;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  pricePerUnit?: number | null;
  periodStart: Date;
  periodEnd: Date;
  invoiceNumber?: string | null;
}

/**
 * Interface for an anomaly check implementation
 */
export interface AnomalyCheck {
  id: string;
  name: string;
  description: string;
  applicableCostTypes: CostType[] | 'all';
  minHistoricalMonths?: number;
  check: (record: CostRecordToCheck, context: CheckContext) => Promise<CheckResult>;
}

/**
 * Detected anomaly to be stored
 */
export interface DetectedAnomaly {
  costRecordId: string;
  type: string;
  severity: AnomalySeverity;
  message: string;
  details: Record<string, unknown>;
  isBackfill: boolean;
}
