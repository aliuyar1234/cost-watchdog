import { describe, it, expect, vi } from 'vitest';
import { prisma } from './setup';

const queueAlertCalls = vi.hoisted(() => [] as Array<unknown>);

vi.mock('../src/lib/queues.js', () => ({
  queueExtraction: vi.fn(async () => undefined),
  queueAnomalyDetection: vi.fn(async () => undefined),
  queueAggregation: vi.fn(async () => undefined),
  queueAlert: vi.fn(async (data: unknown) => {
    queueAlertCalls.push(data);
  }),
}));

import { clearAlertSettingsCache } from '../src/lib/alert-settings.js';
import { OutboxPoller } from '../src/workers/outbox-poller.js';

describe('Outbox -> alerts chain', () => {
  it('processes anomaly.detected events and creates an alert', async () => {
    queueAlertCalls.length = 0;
    clearAlertSettingsCache();

    const supplier = await prisma.supplier.create({
      data: {
        name: 'Test Supplier',
      },
    });

    const costRecord = await prisma.costRecord.create({
      data: {
        supplierId: supplier.id,
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        periodEnd: new Date('2025-01-31T00:00:00.000Z'),
        amount: '100.00',
        costType: 'electricity',
      },
    });

    const anomaly = await prisma.anomaly.create({
      data: {
        costRecordId: costRecord.id,
        type: 'yoy_deviation',
        severity: 'warning',
        message: 'Test anomaly',
        details: {},
      },
    });

    await prisma.appSettings.create({
      data: {
        settings: {
          alerts: {
            emailEnabled: false,
            slackEnabled: true,
            slackWebhookUrl: 'https://example.invalid/webhook',
          },
        },
      },
    });

    const outboxEvent = await prisma.outboxEvent.create({
      data: {
        eventType: 'anomaly.detected',
        aggregateType: 'anomaly',
        aggregateId: anomaly.id,
        nextAttemptAt: new Date(0),
        payload: {
          anomalyId: anomaly.id,
          costRecordId: costRecord.id,
          type: anomaly.type,
          severity: anomaly.severity,
          message: anomaly.message,
        },
      },
    });

    const poller = new OutboxPoller({ batchSize: 10, concurrency: 1 });
    await (poller as unknown as { processEvents: () => Promise<void> }).processEvents();

    const processed = await prisma.outboxEvent.findUnique({
      where: { id: outboxEvent.id },
      select: { processedAt: true },
    });
    expect(processed?.processedAt).toBeTruthy();

    const alerts = await prisma.alert.findMany({
      where: { anomalyId: anomaly.id },
    });
    expect(alerts.length).toBe(1);
    expect(alerts[0]?.channel).toBe('slack');
    expect(queueAlertCalls.length).toBe(1);
  });
});
