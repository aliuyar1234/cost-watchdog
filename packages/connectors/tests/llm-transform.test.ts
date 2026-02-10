import { describe, expect, it } from 'vitest';
import {
  calculateRecordConfidence,
  transformLLMOutput,
} from '../src/pdf/llm-extractor/transform.js';

describe('pdf llm transform', () => {
  it('maps and normalizes parsed fields', () => {
    const { record, warnings } = transformLLMOutput({
      amount: 1234.56,
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      costType: 'Strom',
      supplierName: 'Acme Energy GmbH',
      supplierTaxId: 'DE123456789',
      currency: 'eur',
      unit: 'm3',
      quantity: 987,
      invoiceNumber: 'INV-2025-001',
      meterNumber: 'MTR-42',
      customerNumber: 'CUST-1',
    });

    expect(warnings).toEqual([]);
    expect(record.currency).toBe('EUR');
    expect(record.costType).toBe('electricity');
    expect(record.unit).toBe('m\u00b3');
    expect(record.externalId).toBe('INV-2025-001');
    expect(record.supplier?.name).toBe('Acme Energy GmbH');
    expect(record.supplier?.taxId).toBe('DE123456789');

    const confidence = calculateRecordConfidence(record);
    expect(confidence).toBeGreaterThan(0.8);
    expect(confidence).toBeLessThanOrEqual(0.9);
  });

  it('reports invalid required date formats', () => {
    const { record, warnings } = transformLLMOutput({
      amount: 10,
      periodStart: 'not-a-date',
      periodEnd: 'also-not-a-date',
      supplierName: 'Supplier',
      costType: 'other',
    });

    expect(record.periodStart).toBeUndefined();
    expect(record.periodEnd).toBeUndefined();
    expect(warnings).toContain('Invalid periodStart date format');
    expect(warnings).toContain('Invalid periodEnd date format');
  });

  it('reports suspicious amount/date inconsistencies', () => {
    const { warnings } = transformLLMOutput({
      amount: 100,
      amountNet: 80,
      vatAmount: 5,
      periodStart: '2025-02-10',
      periodEnd: '2025-01-10',
      supplierName: 'Supplier',
      costType: 'other',
    });

    expect(warnings).toContain('Period end is before period start');
    expect(warnings).toContain('Net + VAT does not equal gross amount');
  });
});
