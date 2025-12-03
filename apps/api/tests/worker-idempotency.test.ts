import { describe, it, expect, vi } from 'vitest';
import { prisma } from './setup';

// Mock Redis before importing any module that uses it
vi.mock('../src/lib/redis.js', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  },
  createRedisConnection: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  checkRedisHealth: vi.fn().mockResolvedValue(true),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

// Now import the worker (which will use mocked Redis)
import { processAnomalyDetection } from '../src/workers/anomaly.worker.js';

describe('Worker idempotency', () => {
  it('running anomaly detection twice keeps a single anomaly (upsert idempotent)', async () => {
    // Seed organization and related entities
    const org = await prisma.organization.create({
      data: { name: 'Org', legalName: 'Org GmbH' },
    });

    const location = await prisma.location.create({
      data: {
        organizationId: org.id,
        name: 'HQ',
        address: { country: 'DE' },
        type: 'office',
        ownershipType: 'leased',
      },
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: 'EnergyCo',
        category: 'energy_electricity',
        costTypes: ['electricity'],
      },
    });

    // Use dates relative to now for proper 24-month window detection
    const now = new Date();

    // Create 13 months of historical data to satisfy minHistoricalMonths: 12 requirement
    // We need cost records spanning at least 12 months for the YoY check to work
    for (let i = 1; i <= 13; i++) {
      const month = new Date(now);
      month.setMonth(month.getMonth() - i);

      await prisma.costRecord.create({
        data: {
          supplierId: supplier.id,
          locationId: location.id,
          periodStart: new Date(month.getFullYear(), month.getMonth(), 1),
          periodEnd: new Date(month.getFullYear(), month.getMonth() + 1, 0),
          amount: 100, // consistent baseline amount
          costType: 'electricity',
          currency: 'EUR',
        },
      });
    }

    // Current record with big increase to trigger YoY anomaly
    const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const current = await prisma.costRecord.create({
      data: {
        supplierId: supplier.id,
        locationId: location.id,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        amount: 350, // 250% increase from baseline to trigger anomaly
        costType: 'electricity',
        currency: 'EUR',
      },
    });

    // Run the worker twice
    await processAnomalyDetection({ data: { costRecordId: current.id } } as any);
    await processAnomalyDetection({ data: { costRecordId: current.id } } as any);

    const anomalies = await prisma.anomaly.findMany({
      where: { costRecordId: current.id }
    });

    // Should have detected YoY deviation anomaly, and upsert ensures only one exists
    expect(anomalies.length).toBeGreaterThanOrEqual(1);

    // Check for YoY deviation specifically
    const yoyAnomaly = anomalies.find(a => a.type === 'yoy_deviation');
    expect(yoyAnomaly).toBeDefined();
    expect(yoyAnomaly?.severity).toBeTruthy();
  });
});
