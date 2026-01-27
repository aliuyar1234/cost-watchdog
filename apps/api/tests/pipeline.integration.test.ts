import { describe, it, expect, vi } from 'vitest';
import { prisma } from './setup';

const s3DownloadState = vi.hoisted(() => ({ buffer: Buffer.from('') }));

vi.mock('../src/lib/s3.js', () => ({
  downloadFile: vi.fn(async () => s3DownloadState.buffer),
}));

vi.mock('../src/lib/email.js', () => ({
  sendAnomalyAlertEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock('../src/lib/slack.js', () => ({
  sendSlackAnomalyAlert: vi.fn(async () => ({ success: true })),
}));

vi.mock('../src/lib/teams.js', () => ({
  sendTeamsAnomalyAlert: vi.fn(async () => ({ success: true })),
}));

import { clearAlertSettingsCache } from '../src/lib/alert-settings.js';
import { closeQueues } from '../src/lib/queues.js';
import { createAggregationWorker } from '../src/workers/aggregation.worker.js';
import { createAlertWorker } from '../src/workers/alert.worker.js';
import { createAnomalyWorker } from '../src/workers/anomaly.worker.js';
import { createExtractionWorker } from '../src/workers/extraction.worker.js';
import { OutboxPoller } from '../src/workers/outbox-poller.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Keep interval short - the workers should be quick in tests.
  const intervalMs = 100;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(intervalMs);
  }

  throw new Error(`Timed out after ${timeoutMs}ms`);
}

describe('End-to-end pipeline (outbox + queues + workers)', () => {
  it('processes document.uploaded -> extraction -> anomaly.detected -> alert sent', async () => {
    clearAlertSettingsCache();

    await prisma.appSettings.create({
      data: {
        settings: {
          alerts: {
            emailEnabled: false,
            slackEnabled: true,
            slackWebhookUrl: 'https://example.invalid/webhook',
            notifyOnWarning: true,
            notifyOnCritical: true,
            notifyOnInfo: false,
            maxAlertsPerDay: 1000,
          },
        },
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
      },
    });

    const location = await prisma.location.create({
      data: {
        organizationId: organization.id,
        name: 'HQ',
        address: {
          line1: 'Test Street 1',
          city: 'Test City',
          country: 'DE',
        },
      },
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: 'Acme Energy',
      },
    });

    const now = new Date();
    const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    await prisma.costRecord.create({
      data: {
        locationId: location.id,
        supplierId: supplier.id,
        periodStart: previousPeriodStart,
        periodEnd: previousPeriodEnd,
        amount: '1000.00',
        currency: 'EUR',
        costType: 'electricity',
        invoiceNumber: 'INV-HIST',
      },
    });

    const user = await prisma.user.create({
      data: {
        email: 'pipeline@test.com',
        passwordHash: 'placeholder',
        firstName: 'Pipeline',
        lastName: 'Test',
        role: 'admin',
      },
    });

    const document = await prisma.document.create({
      data: {
        filename: 'pipeline.csv',
        originalFilename: 'pipeline.csv',
        mimeType: 'text/csv',
        fileSize: 123,
        fileHash: 'pipeline-hash',
        storagePath: 'documents/pipeline.csv',
        uploadedBy: user.id,
      },
    });

    const csv = [
      'supplier,location,periodStart,periodEnd,amount,costType,invoiceNumber,currency',
      `Acme Energy,${location.id},${formatYmd(currentPeriodStart)},${formatYmd(currentPeriodEnd)},1000.00,electricity,INV-NEW,EUR`,
      '',
    ].join('\n');
    s3DownloadState.buffer = Buffer.from(csv, 'utf8');

    await prisma.outboxEvent.create({
      data: {
        eventType: 'document.uploaded',
        aggregateType: 'document',
        aggregateId: document.id,
        nextAttemptAt: new Date(0),
        payload: {
          documentId: document.id,
          storagePath: document.storagePath,
          mimeType: document.mimeType,
          filename: document.originalFilename,
        },
      },
    });

    const extractionWorker = createExtractionWorker();
    const anomalyWorker = createAnomalyWorker();
    const alertWorker = createAlertWorker();
    const aggregationWorker = createAggregationWorker();

    const poller = new OutboxPoller({ batchSize: 50, concurrency: 5 });
    const processOutbox = async (): Promise<void> => {
      await (poller as unknown as { processEvents: () => Promise<void> }).processEvents();
    };

    try {
      // 1) document.uploaded -> extraction job
      await processOutbox();

      await waitFor(async () => {
        const updated = await prisma.document.findUnique({
          where: { id: document.id },
          select: { extractionStatus: true },
        });
        return updated?.extractionStatus === 'completed';
      });

      const extractedCostRecord = await prisma.costRecord.findFirst({
        where: { sourceDocumentId: document.id },
        select: { id: true },
      });
      expect(extractedCostRecord).toBeTruthy();

      // 2) cost_record.created -> anomaly detection + aggregation jobs
      await processOutbox();

      await waitFor(async () => {
        const anomalyCount = await prisma.anomaly.count({
          where: { costRecordId: extractedCostRecord!.id },
        });
        return anomalyCount > 0;
      });

      // 3) anomaly.detected -> alert job
      await processOutbox();

      await waitFor(async () => {
        const sent = await prisma.alert.count({ where: { status: 'sent' } });
        return sent > 0;
      });
    } finally {
      await Promise.all([
        extractionWorker.close(),
        anomalyWorker.close(),
        alertWorker.close(),
        aggregationWorker.close(),
      ]);
      await closeQueues();
    }
  }, 60_000);
});
