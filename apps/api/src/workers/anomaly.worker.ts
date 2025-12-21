import { Worker, Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import {
  createAnomalyEngine,
  getCheckById,
  type AnomalySettings,
  type CostRecordToCheck,
  type CheckContext,
  type HistoricalCostRecord,
  type BudgetContext,
  type CostType,
  DEFAULT_ANOMALY_SETTINGS,
} from '@cost-watchdog/core';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES } from '../lib/queues.js';
import { prisma } from '../lib/db.js';

interface ThresholdSettings {
  yoyThreshold: number;
  momThreshold: number;
  pricePerUnitThreshold: number;
  budgetThreshold: number;
  minHistoricalMonths: number;
}

const DEFAULT_THRESHOLD_SETTINGS: ThresholdSettings = {
  yoyThreshold: DEFAULT_ANOMALY_SETTINGS.alertThresholds.yoyDeviationPercent,
  momThreshold: DEFAULT_ANOMALY_SETTINGS.alertThresholds.momDeviationPercent,
  pricePerUnitThreshold: DEFAULT_ANOMALY_SETTINGS.alertThresholds.pricePerUnitDeviationPercent,
  budgetThreshold: DEFAULT_ANOMALY_SETTINGS.alertThresholds.budgetExceededPercent,
  minHistoricalMonths: 12,
};

const SETTINGS_CACHE_TTL_MS = 60 * 1000;
let cachedThresholdSettings: ThresholdSettings | null = null;
let cachedThresholdSettingsAt = 0;

function normalizeSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function isThresholdSettings(value: unknown): value is Partial<ThresholdSettings> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function loadThresholdSettings(): Promise<ThresholdSettings> {
  const now = Date.now();
  if (cachedThresholdSettings && now - cachedThresholdSettingsAt < SETTINGS_CACHE_TTL_MS) {
    return cachedThresholdSettings;
  }

  const record = await prisma.appSettings.findFirst();
  const settings = normalizeSettings(record?.settings);
  const thresholds = settings['thresholds'];

  const merged = {
    ...DEFAULT_THRESHOLD_SETTINGS,
    ...(isThresholdSettings(thresholds) ? thresholds : {}),
  } as ThresholdSettings;

  cachedThresholdSettings = merged;
  cachedThresholdSettingsAt = now;
  return merged;
}

function applyMinHistoricalMonths(minHistoricalMonths: number): void {
  const yoyCheck = getCheckById('yoy_deviation');
  if (yoyCheck) {
    yoyCheck.minHistoricalMonths = minHistoricalMonths;
  }
}

function buildAnomalySettings(thresholds: ThresholdSettings): AnomalySettings {
  return {
    ...DEFAULT_ANOMALY_SETTINGS,
    alertThresholds: {
      ...DEFAULT_ANOMALY_SETTINGS.alertThresholds,
      yoyDeviationPercent: thresholds.yoyThreshold,
      momDeviationPercent: thresholds.momThreshold,
      pricePerUnitDeviationPercent: thresholds.pricePerUnitThreshold,
      budgetExceededPercent: thresholds.budgetThreshold,
    },
  };
}

/**
 * Job payload for anomaly detection
 */
interface AnomalyJobPayload {
  costRecordId: string;
  isBackfill?: boolean;
}

/**
 * Process anomaly detection for a cost record
 */
export async function processAnomalyDetection(job: Job<AnomalyJobPayload>): Promise<void> {
  const { costRecordId, isBackfill = false } = job.data;

  console.log(`[AnomalyWorker] Processing anomaly detection for cost record ${costRecordId}`);

  // Fetch the cost record
  const costRecord = await prisma.costRecord.findUnique({
    where: { id: costRecordId },
    include: {
      location: true,
      supplier: true,
    },
  });

  if (!costRecord) {
    console.warn(`[AnomalyWorker] Cost record ${costRecordId} not found`);
    return;
  }

  if (!costRecord.location || !costRecord.supplier) {
    console.warn(`[AnomalyWorker] Cost record ${costRecordId} missing location or supplier`);
    return;
  }

  // Fetch historical records (24 months)
  const twentyFourMonthsAgo = new Date();
  twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);

  const historicalRecords = await prisma.costRecord.findMany({
    where: {
      locationId: costRecord.locationId,
      supplierId: costRecord.supplierId,
      periodStart: {
        gte: twentyFourMonthsAgo,
      },
      id: {
        not: costRecordId,
      },
    },
    orderBy: {
      periodStart: 'desc',
    },
  });

  // Prepare budget context (Budget model may not exist yet)
  const budgetContext: BudgetContext | undefined = undefined;

  const thresholdSettings = await loadThresholdSettings();
  applyMinHistoricalMonths(thresholdSettings.minHistoricalMonths);
  const anomalySettings = buildAnomalySettings(thresholdSettings);

  // Prepare the record for checking
  const recordToCheck: CostRecordToCheck = {
    id: costRecord.id,
    locationId: costRecord.location.id,
    supplierId: costRecord.supplier.id,
    costType: costRecord.costType as CostType,
    amount: costRecord.amount.toNumber(),
    quantity: costRecord.quantity?.toNumber() ?? null,
    unit: costRecord.unit,
    pricePerUnit: costRecord.pricePerUnit?.toNumber() ?? null,
    periodStart: costRecord.periodStart,
    periodEnd: costRecord.periodEnd,
    invoiceNumber: costRecord.invoiceNumber,
  };

  // Prepare historical records
  const historicalForContext: HistoricalCostRecord[] = historicalRecords.map(r => ({
    id: r.id,
    costType: r.costType as CostType,
    amount: r.amount.toNumber(),
    quantity: r.quantity?.toNumber() ?? null,
    unit: r.unit,
    pricePerUnit: r.pricePerUnit?.toNumber() ?? null,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    supplierId: r.supplierId,
    invoiceNumber: r.invoiceNumber,
  }));

  // Build check context
  const context: CheckContext = {
    location: {
      id: costRecord.location.id,
      name: costRecord.location.name,
      type: costRecord.location.type,
    },
    supplier: {
      id: costRecord.supplier.id,
      name: costRecord.supplier.name,
      category: costRecord.supplier.category,
    },
    historicalRecords: historicalForContext,
    budget: budgetContext,
    settings: anomalySettings,
  };

  // Create anomaly engine and run detection
  const engine = createAnomalyEngine(anomalySettings);
  const result = await engine.detect(recordToCheck, context, { isBackfill });

  console.log(
    `[AnomalyWorker] Detection complete for ${costRecordId}: ${result.anomalies.length} anomalies found`
  );

  // Store detected anomalies
  for (const anomaly of result.anomalies) {
    await prisma.anomaly.upsert({
      where: {
        costRecordId_type: {
          costRecordId: anomaly.costRecordId,
          type: anomaly.type,
        },
      },
      create: {
        costRecordId: anomaly.costRecordId,
        type: anomaly.type,
        severity: anomaly.severity,
        message: anomaly.message,
        details: anomaly.details as Prisma.InputJsonValue,
        isBackfill: anomaly.isBackfill,
        status: 'new',
      },
      update: {
        severity: anomaly.severity,
        message: anomaly.message,
        details: anomaly.details as Prisma.InputJsonValue,
        isBackfill: anomaly.isBackfill,
      },
    });

    // Queue alert if not backfill and severity is warning or critical
    if (!isBackfill && (anomaly.severity === 'warning' || anomaly.severity === 'critical')) {
      // Create outbox event for alert
      await prisma.outboxEvent.create({
        data: {
          eventType: 'anomaly.detected',
          aggregateType: 'anomaly',
          aggregateId: costRecordId,
          payload: {
            costRecordId: anomaly.costRecordId,
            type: anomaly.type,
            severity: anomaly.severity,
            message: anomaly.message,
          },
        },
      });
    }
  }

  console.log(
    `[AnomalyWorker] Stored ${result.anomalies.length} anomalies for cost record ${costRecordId}`
  );
}

/**
 * Create and start the anomaly worker
 */
export function createAnomalyWorker(): Worker<AnomalyJobPayload> {
  const connection = createRedisConnection();

  const worker = new Worker<AnomalyJobPayload>(
    QUEUE_NAMES.ANOMALY_DETECTION,
    processAnomalyDetection,
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 1000, // 100 jobs per second max
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AnomalyWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AnomalyWorker] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('[AnomalyWorker] Worker error:', err);
  });

  console.log('[AnomalyWorker] Worker started');

  return worker;
}
