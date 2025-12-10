import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES } from '../lib/queues.js';
import { prisma } from '../lib/db.js';

/**
 * Job payload for aggregation
 */
interface AggregationJobPayload {
  costRecordId: string;
  type: 'update' | 'full_rebuild';
}

/**
 * Update aggregation for a single cost record
 */
async function updateAggregation(costRecordId: string): Promise<void> {
  // Get the cost record
  const costRecord = await prisma.costRecord.findUnique({
    where: { id: costRecordId },
  });

  if (!costRecord) {
    console.warn(`[AggregationWorker] Cost record ${costRecordId} not found`);
    return;
  }

  const year = costRecord.periodStart.getFullYear();
  const month = costRecord.periodStart.getMonth() + 1;

  // Find existing aggregation record
  const existing = await prisma.costRecordMonthlyAgg.findFirst({
    where: {
      year,
      month,
      locationId: costRecord.locationId,
      supplierId: costRecord.supplierId,
      costType: costRecord.costType,
    },
  });

  if (existing) {
    // Update existing record
    await prisma.costRecordMonthlyAgg.update({
      where: { id: existing.id },
      data: {
        amountSum: { increment: costRecord.amount },
        amountNetSum: costRecord.amountNet
          ? { increment: costRecord.amountNet }
          : undefined,
        quantitySum: costRecord.quantity
          ? { increment: costRecord.quantity }
          : undefined,
        recordCount: { increment: 1 },
        lastUpdatedAt: new Date(),
      },
    });
  } else {
    // Create new record
    await prisma.costRecordMonthlyAgg.create({
      data: {
        year,
        month,
        locationId: costRecord.locationId,
        supplierId: costRecord.supplierId,
        costType: costRecord.costType,
        amountSum: costRecord.amount,
        amountNetSum: costRecord.amountNet,
        quantitySum: costRecord.quantity,
        recordCount: 1,
      },
    });
  }

  console.log(
    `[AggregationWorker] Updated aggregation for ${year}-${month} ${costRecord.costType}`
  );
}

// Batch size for processing cost records
const BATCH_SIZE = 1000;

/**
 * Full rebuild of all aggregations using cursor-based pagination
 * for O(n) performance instead of O(n²) with offset pagination.
 */
async function rebuildAggregations(): Promise<void> {
  console.log(`[AggregationWorker] Starting full rebuild with cursor-based pagination`);

  // Delete existing aggregations
  await prisma.costRecordMonthlyAgg.deleteMany({});

  // Group by dimensions using in-memory aggregation with cursor-based fetching
  const aggregations = new Map<string, {
    year: number;
    month: number;
    locationId: string | null;
    supplierId: string;
    costType: string;
    amountSum: number;
    amountNetSum: number;
    quantitySum: number;
    recordCount: number;
  }>();

  let lastId: string | null = null;
  let processedCount = 0;

  // Process in batches using cursor pagination (O(n) instead of O(n²) with offset)
  while (true) {
    const records = await prisma.costRecord.findMany({
      select: {
        id: true,
        periodStart: true,
        locationId: true,
        supplierId: true,
        costType: true,
        amount: true,
        amountNet: true,
        quantity: true,
      },
      where: lastId ? { id: { gt: lastId } } : undefined,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (records.length === 0) {
      break;
    }

    for (const record of records) {
      const year = record.periodStart.getFullYear();
      const month = record.periodStart.getMonth() + 1;
      const key = `${year}-${month}-${record.locationId || 'null'}-${record.supplierId}-${record.costType}`;

      const existing = aggregations.get(key);
      if (existing) {
        existing.amountSum += Number(record.amount);
        existing.amountNetSum += Number(record.amountNet || 0);
        existing.quantitySum += Number(record.quantity || 0);
        existing.recordCount += 1;
      } else {
        aggregations.set(key, {
          year,
          month,
          locationId: record.locationId,
          supplierId: record.supplierId,
          costType: record.costType,
          amountSum: Number(record.amount),
          amountNetSum: Number(record.amountNet || 0),
          quantitySum: Number(record.quantity || 0),
          recordCount: 1,
        });
      }
    }

    processedCount += records.length;
    lastId = records[records.length - 1].id;
    console.log(`[AggregationWorker] Processed ${processedCount} records...`);

    // If we got fewer records than batch size, we're done
    if (records.length < BATCH_SIZE) {
      break;
    }
  }

  // Batch insert aggregations in chunks
  const aggData = Array.from(aggregations.values()).map(agg => ({
    year: agg.year,
    month: agg.month,
    locationId: agg.locationId,
    supplierId: agg.supplierId,
    costType: agg.costType,
    amountSum: agg.amountSum,
    amountNetSum: agg.amountNetSum || null,
    quantitySum: agg.quantitySum || null,
    recordCount: agg.recordCount,
  }));

  // Insert in batches of 500 to avoid large transaction overhead
  const INSERT_BATCH_SIZE = 500;
  for (let i = 0; i < aggData.length; i += INSERT_BATCH_SIZE) {
    const batch = aggData.slice(i, i + INSERT_BATCH_SIZE);
    await prisma.costRecordMonthlyAgg.createMany({ data: batch });
  }

  console.log(
    `[AggregationWorker] Rebuild complete: ${aggData.length} aggregations created from ${processedCount} records`
  );
}

/**
 * Process aggregation job
 */
async function processAggregation(job: Job<AggregationJobPayload>): Promise<void> {
  const { costRecordId, type } = job.data;

  console.log(`[AggregationWorker] Processing ${type}`);

  if (type === 'full_rebuild') {
    await rebuildAggregations();
  } else {
    await updateAggregation(costRecordId);
  }
}

/**
 * Create and start the aggregation worker
 */
export function createAggregationWorker(): Worker<AggregationJobPayload> {
  const connection = createRedisConnection();

  const worker = new Worker<AggregationJobPayload>(
    QUEUE_NAMES.AGGREGATION,
    processAggregation,
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AggregationWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AggregationWorker] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('[AggregationWorker] Worker error:', err);
  });

  console.log('[AggregationWorker] Worker started');

  return worker;
}
