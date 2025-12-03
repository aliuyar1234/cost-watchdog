import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';
import type { CostType } from '../../types';

/**
 * Cost types that should have regular periodic invoices
 */
const APPLICABLE_COST_TYPES: CostType[] = [
  'electricity',
  'natural_gas',
  'district_heating',
  'water',
  'telecom_mobile',
  'telecom_landline',
  'telecom_internet',
  'insurance',
  'rent',
];

/**
 * Gap threshold in days (invoices more than 45 days apart indicate missing period)
 */
const GAP_THRESHOLD_DAYS = 45;

/**
 * Convert days to milliseconds
 */
const DAYS_TO_MS = 24 * 60 * 60 * 1000;

/**
 * Missing Period (Gap) Check
 *
 * Detects gaps in recurring costs where invoices are expected regularly.
 * Triggers when there's more than 45 days between the end of the last
 * invoice period and the start of the current one.
 */
export const missingPeriodCheck: AnomalyCheck = {
  id: 'missing_period',
  name: 'Fehlende Periode',
  description: 'Erkennt Lücken in wiederkehrenden Kosten',
  applicableCostTypes: APPLICABLE_COST_TYPES,
  minHistoricalMonths: 2,

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Get records of the same cost type and supplier
    const sameTypeRecords = context.historicalRecords
      .filter(r =>
        r.costType === record.costType &&
        r.supplierId === record.supplierId &&
        r.periodEnd.getTime() < record.periodStart.getTime()
      )
      .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());

    // Get the most recent previous record
    const lastRecord = sameTypeRecords[0];

    if (!lastRecord) {
      return { triggered: false };
    }

    // Calculate the expected start date (day after last period ended)
    const expectedNextStart = new Date(lastRecord.periodEnd);
    expectedNextStart.setDate(expectedNextStart.getDate() + 1);

    // Calculate the gap
    const gapMs = record.periodStart.getTime() - expectedNextStart.getTime();
    const gapDays = Math.floor(gapMs / DAYS_TO_MS);

    if (gapDays > GAP_THRESHOLD_DAYS) {
      // Calculate number of potentially missing invoices
      // Assuming monthly invoices, estimate how many might be missing
      const estimatedMissingInvoices = Math.floor(gapDays / 30);

      return {
        triggered: true,
        severity: 'info',
        message: `${gapDays} Tage Lücke seit letzter Rechnung (${estimatedMissingInvoices} Rechnung(en) fehlen möglicherweise)`,
        details: {
          lastPeriodEnd: lastRecord.periodEnd.toISOString(),
          lastRecordId: lastRecord.id,
          currentPeriodStart: record.periodStart.toISOString(),
          expectedNextStart: expectedNextStart.toISOString(),
          gapDays,
          estimatedMissingInvoices,
          method: 'period_gap',
        },
      };
    }

    return { triggered: false };
  },
};
