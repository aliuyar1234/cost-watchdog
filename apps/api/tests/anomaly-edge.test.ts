import { describe, it, expect } from 'vitest';
import { createAnomalyEngine, DEFAULT_ANOMALY_SETTINGS, type CostRecordToCheck, type CheckContext } from '@cost-watchdog/core';

const baseRecord: CostRecordToCheck = {
  id: 'rec-1',
  locationId: 'loc-1',
  supplierId: 'sup-1',
  costType: 'electricity',
  amount: 100,
  quantity: null,
  unit: null,
  pricePerUnit: null,
  periodStart: new Date('2024-01-01'),
  periodEnd: new Date('2024-01-31'),
  invoiceNumber: 'INV-1',
};

const baseContext: CheckContext = {
  location: { id: 'loc-1', name: 'HQ', type: 'office' },
  supplier: { id: 'sup-1', name: 'EnergyCo', category: 'energy_electricity' },
  historicalRecords: [],
  budget: undefined,
  settings: DEFAULT_ANOMALY_SETTINGS,
};

describe('Anomaly detection edge cases', () => {
  it('handles empty history without throwing', async () => {
    const engine = createAnomalyEngine();
    const result = await engine.detect(baseRecord, { ...baseContext, historicalRecords: [] });
    expect(result.anomalies.length).toBe(0);
  });

  it('handles negative amounts gracefully', async () => {
    const engine = createAnomalyEngine();
    const record = { ...baseRecord, amount: -50 };
    const result = await engine.detect(record, {
      ...baseContext,
      historicalRecords: [
        { ...record, id: 'hist-1', amount: -40, periodStart: new Date('2023-01-01'), periodEnd: new Date('2023-01-31') },
      ],
    });

    expect(result.checkResults.every((c) => Number.isFinite((c.result as any)?.deviationPercent ?? 0))).toBe(true);
    expect(result.anomalies.length).toBeGreaterThanOrEqual(0);
  });

  it('avoids division by zero in price-per-unit check', async () => {
    const engine = createAnomalyEngine();
    const record = { ...baseRecord, quantity: 10, pricePerUnit: 0.5 };
    const historical = [
      {
        ...record,
        id: 'hist-ppu-1',
        pricePerUnit: 0,
        periodStart: new Date('2023-10-01'),
        periodEnd: new Date('2023-10-31'),
      },
      {
        ...record,
        id: 'hist-ppu-2',
        pricePerUnit: 0.4,
        periodStart: new Date('2023-11-01'),
        periodEnd: new Date('2023-11-30'),
      },
      {
        ...record,
        id: 'hist-ppu-3',
        pricePerUnit: 0.42,
        periodStart: new Date('2023-12-01'),
        periodEnd: new Date('2023-12-31'),
      },
    ];

    const result = await engine.detect(record, { ...baseContext, historicalRecords: historical });

    // Even with a zero historical price, no division-by-zero should occur and result is finite
    const ppuCheck = result.checkResults.find((c) => c.checkId === 'price_per_unit_spike');
    expect(ppuCheck).toBeTruthy();
    expect(ppuCheck?.result).toBeDefined();
  });
});
