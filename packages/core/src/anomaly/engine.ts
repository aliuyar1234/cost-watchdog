import type {
  AnomalyCheck,
  AnomalySettings,
  CheckContext,
  CheckResult,
  CostRecordToCheck,
  DetectedAnomaly,
  HistoricalCostRecord,
} from './types';
import { DEFAULT_ANOMALY_SETTINGS } from './types';
import { ALL_CHECKS, getCheckById } from './checks';
import type { CostType } from '../types';

/**
 * Options for running anomaly detection
 */
export interface DetectionOptions {
  /**
   * Whether this is a backfill (historical import)
   * Backfill anomalies are stored but don't trigger alerts
   */
  isBackfill?: boolean;

  /**
   * Specific checks to run (by ID). If not provided, runs all enabled checks.
   */
  checkIds?: string[];
}

/**
 * Result from running anomaly detection
 */
export interface DetectionResult {
  /**
   * The cost record that was checked
   */
  costRecordId: string;

  /**
   * All detected anomalies
   */
  anomalies: DetectedAnomaly[];

  /**
   * Results from each check (including non-triggered)
   */
  checkResults: Array<{
    checkId: string;
    checkName: string;
    result: CheckResult;
    skipped: boolean;
    skipReason?: string;
  }>;

  /**
   * Whether this was a backfill detection
   */
  isBackfill: boolean;
}

/**
 * Anomaly Detection Engine
 *
 * Runs configured checks against cost records to detect anomalies.
 */
export class AnomalyEngine {
  private settings: AnomalySettings;

  constructor(settings?: Partial<AnomalySettings>) {
    this.settings = {
      ...DEFAULT_ANOMALY_SETTINGS,
      ...settings,
      alertThresholds: {
        ...DEFAULT_ANOMALY_SETTINGS.alertThresholds,
        ...settings?.alertThresholds,
      },
    };
  }

  /**
   * Update engine settings
   */
  updateSettings(settings: Partial<AnomalySettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
      alertThresholds: {
        ...this.settings.alertThresholds,
        ...settings.alertThresholds,
      },
    };
  }

  /**
   * Run anomaly detection on a cost record
   */
  async detect(
    record: CostRecordToCheck,
    context: CheckContext,
    options: DetectionOptions = {}
  ): Promise<DetectionResult> {
    const { isBackfill = false, checkIds } = options;

    // Determine which checks to run
    const checksToRun = this.getChecksToRun(record.costType, checkIds);

    // Calculate months of historical data
    const historicalMonths = this.calculateHistoricalMonths(context.historicalRecords);

    // Run all applicable checks
    const checkResults: DetectionResult['checkResults'] = [];
    const anomalies: DetectedAnomaly[] = [];

    for (const check of checksToRun) {
      // Check if we have enough historical data
      if (check.minHistoricalMonths && historicalMonths < check.minHistoricalMonths) {
        checkResults.push({
          checkId: check.id,
          checkName: check.name,
          result: { triggered: false },
          skipped: true,
          skipReason: `Insufficient historical data (${historicalMonths} months, need ${check.minHistoricalMonths})`,
        });
        continue;
      }

      try {
        // Run the check
        const result = await check.check(record, {
          ...context,
          settings: this.settings,
        });

        checkResults.push({
          checkId: check.id,
          checkName: check.name,
          result,
          skipped: false,
        });

        // Create anomaly if triggered
        if (result.triggered && result.severity && result.message) {
          anomalies.push({
            costRecordId: record.id,
            type: check.id,
            severity: result.severity,
            message: result.message,
            details: result.details || {},
            isBackfill,
          });
        }
      } catch (error) {
        // Log error but continue with other checks
        console.error(`Error running check ${check.id}:`, error);
        checkResults.push({
          checkId: check.id,
          checkName: check.name,
          result: { triggered: false },
          skipped: true,
          skipReason: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    return {
      costRecordId: record.id,
      anomalies,
      checkResults,
      isBackfill,
    };
  }

  /**
   * Get checks to run based on cost type and optional filter
   */
  private getChecksToRun(costType: CostType, checkIds?: string[]): AnomalyCheck[] {
    // Start with enabled checks
    let checks = ALL_CHECKS.filter(check =>
      this.settings.enabledChecks.includes(check.id)
    );

    // Filter by specific check IDs if provided
    if (checkIds && checkIds.length > 0) {
      checks = checks.filter(check => checkIds.includes(check.id));
    }

    // Filter by applicable cost types
    checks = checks.filter(check =>
      check.applicableCostTypes === 'all' ||
      check.applicableCostTypes.includes(costType)
    );

    return checks;
  }

  /**
   * Calculate number of months of historical data
   */
  private calculateHistoricalMonths(records: HistoricalCostRecord[]): number {
    if (records.length === 0) return 0;

    const dates = records.map(r => r.periodStart.getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);

    const months = (maxDate - minDate) / (30 * 24 * 60 * 60 * 1000);
    return Math.floor(months);
  }

  /**
   * Get current settings
   */
  getSettings(): AnomalySettings {
    return { ...this.settings };
  }

  /**
   * Check if a specific check is enabled
   */
  isCheckEnabled(checkId: string): boolean {
    return this.settings.enabledChecks.includes(checkId);
  }

  /**
   * Enable a check
   */
  enableCheck(checkId: string): void {
    if (!this.settings.enabledChecks.includes(checkId)) {
      this.settings.enabledChecks.push(checkId);
    }
  }

  /**
   * Disable a check
   */
  disableCheck(checkId: string): void {
    this.settings.enabledChecks = this.settings.enabledChecks.filter(id => id !== checkId);
  }
}

/**
 * Create a new anomaly engine with default or custom settings
 */
export function createAnomalyEngine(settings?: Partial<AnomalySettings>): AnomalyEngine {
  return new AnomalyEngine(settings);
}
