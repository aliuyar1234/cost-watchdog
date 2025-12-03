import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';

/**
 * Time window for duplicate detection (45 days in milliseconds)
 */
const DUPLICATE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * Amount tolerance for near-duplicate detection (0.01 = 1%)
 */
const AMOUNT_TOLERANCE = 0.01;

/**
 * Duplicate Detection Check
 *
 * Detects potential duplicate invoices based on:
 * - Same supplier
 * - Same or very similar amount
 * - Within 45 days of each other
 */
export const duplicateCheck: AnomalyCheck = {
  id: 'duplicate_detection',
  name: 'Duplikat-Erkennung',
  description: 'Erkennt mögliche doppelte Rechnungen',
  applicableCostTypes: 'all',

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Find potential duplicates
    const potentialDuplicates = context.historicalRecords.filter(r => {
      // Skip the record itself
      if (r.id === record.id) return false;

      // Must be same supplier
      if (r.supplierId !== record.supplierId) return false;

      // Check if amounts are equal or very close
      const amountDiff = Math.abs(r.amount - record.amount);
      const amountMatch = amountDiff === 0 || amountDiff / record.amount < AMOUNT_TOLERANCE;
      if (!amountMatch) return false;

      // Must be within the time window
      const timeDiff = Math.abs(r.periodStart.getTime() - record.periodStart.getTime());
      if (timeDiff > DUPLICATE_WINDOW_MS) return false;

      return true;
    });

    if (potentialDuplicates.length > 0) {
      // Check if any of the duplicates have the same invoice number
      const sameInvoiceNumber = potentialDuplicates.some(
        d => d.invoiceNumber && record.invoiceNumber && d.invoiceNumber === record.invoiceNumber
      );

      const severity = sameInvoiceNumber ? 'critical' : 'warning';

      return {
        triggered: true,
        severity,
        message: sameInvoiceNumber
          ? `Rechnung mit gleicher Rechnungsnummer bereits vorhanden`
          : `${potentialDuplicates.length} mögliche(s) Duplikat(e) gefunden`,
        details: {
          duplicateCandidates: potentialDuplicates.map(d => ({
            id: d.id,
            invoiceNumber: d.invoiceNumber,
            periodStart: d.periodStart.toISOString(),
            amount: d.amount,
            daysDifference: Math.round(
              Math.abs(d.periodStart.getTime() - record.periodStart.getTime()) / (24 * 60 * 60 * 1000)
            ),
          })),
          sameInvoiceNumber,
          method: 'exact_match',
        },
      };
    }

    return { triggered: false };
  },
};
