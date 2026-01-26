import { Worker, Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES } from '../lib/queues.js';
import { prisma } from '../lib/db.js';
import { backgroundJobDuration, backgroundJobsTotal } from '../lib/metrics.js';

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

  if (!costRecord.locationId) {
    console.warn(`[AggregationWorker] Cost record ${costRecordId} missing locationId`);
    return;
  }

  const year = costRecord.periodStart.getFullYear();
  const month = costRecord.periodStart.getMonth() + 1;

  await prisma.costRecordMonthlyAgg.upsert({
    where: {
      year_month_locationId_supplierId_costType: {
        year,
        month,
        locationId: costRecord.locationId,
        supplierId: costRecord.supplierId,
        costType: costRecord.costType,
      },
    },
    update: {
      amountSum: { increment: costRecord.amount },
      amountNetSum: costRecord.amountNet ? { increment: costRecord.amountNet } : undefined,
      quantitySum: costRecord.quantity ? { increment: costRecord.quantity } : undefined,
      recordCount: { increment: 1 },
      lastUpdatedAt: new Date(),
    },
    create: {
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

  console.log(
    `[AggregationWorker] Updated aggregation for ${year}-${month} ${costRecord.costType}`,
  );
}

// Batch size for processing cost records
const BATCH_SIZE = 1000;

type AggregationCostRecord = Prisma.CostRecordGetPayload<{
  select: {
    id: true;
    periodStart: true;
    locationId: true;
    supplierId: true;
    costType: true;
    amount: true;
    amountNet: true;
    quantity: true;
  };
}>;

/**
 * Full rebuild of all aggregations using cursor-based pagination
 * for O(n) performance instead of O(n²) with offset pagination.
 */
async function rebuildAggregationsLegacy(): Promise<void> {
  console.log(`[AggregationWorker] Starting full rebuild with cursor-based pagination`);

  // Delete existing aggregations
  await prisma.costRecordMonthlyAgg.deleteMany({});

  // Group by dimensions using in-memory aggregation with cursor-based fetching
  const aggregations = new Map<
    string,
    {
      year: number;
      month: number;
      locationId: string | null;
      supplierId: string;
      costType: string;
      amountSum: number;
      amountNetSum: number;
      quantitySum: number;
      recordCount: number;
    }
  >();

  let lastId: string | null = null;
  let processedCount = 0;

  // Process in batches using cursor pagination (O(n) instead of O(n²) with offset)
  let hasMore = true;
  while (hasMore) {
    const records: AggregationCostRecord[] = await prisma.costRecord.findMany({
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
      hasMore = false;
      continue;
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
    const lastRecord = records.at(-1);
    if (!lastRecord) {
      hasMore = false;
      continue;
    }
    lastId = lastRecord.id;
    console.log(`[AggregationWorker] Processed ${processedCount} records...`);

    // If we got fewer records than batch size, we're done
    if (records.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  // Batch insert aggregations in chunks
  const aggData = Array.from(aggregations.values()).map((agg) => ({
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
    `[AggregationWorker] Rebuild complete: ${aggData.length} aggregations created from ${processedCount} records`,
  );
}

type AggregationRow = {
  year: number;
  month: number;
  locationId: string;
  supplierId: string;
  costType: string;
  amountSum: Prisma.Decimal;
  amountNetSum: Prisma.Decimal | null;
  quantitySum: Prisma.Decimal | null;
  recordCount: number;
};

async function rebuildAggregationsServerSide(): Promise<void> {
  console.log('[AggregationWorker] Starting full rebuild with server-side aggregation');

  await prisma.costRecordMonthlyAgg.deleteMany({});

  const rows = await prisma.$queryRaw<AggregationRow[]>`
    SELECT
      EXTRACT(YEAR FROM period_start)::int AS "year",
      EXTRACT(MONTH FROM period_start)::int AS "month",
      location_id AS "locationId",
      supplier_id AS "supplierId",
      cost_type AS "costType",
      SUM(amount) AS "amountSum",
      SUM(amount_net) AS "amountNetSum",
      SUM(quantity) AS "quantitySum",
      COUNT(*)::int AS "recordCount"
    FROM cost_records
    WHERE location_id IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1, 2, 3, 4, 5
  `;

  const aggData = rows.map((row) => ({
    year: row.year,
    month: row.month,
    locationId: row.locationId,
    supplierId: row.supplierId,
    costType: row.costType,
    amountSum: row.amountSum,
    amountNetSum: row.amountNetSum,
    quantitySum: row.quantitySum,
    recordCount: row.recordCount,
  }));

  const INSERT_BATCH_SIZE = 500;
  for (let i = 0; i < aggData.length; i += INSERT_BATCH_SIZE) {
    const batch = aggData.slice(i, i + INSERT_BATCH_SIZE);
    await prisma.costRecordMonthlyAgg.createMany({ data: batch });
  }

  const processedCount = aggData.reduce((sum, agg) => sum + agg.recordCount, 0);
  console.log(
    `[AggregationWorker] Rebuild complete: ${aggData.length} aggregations created from ${processedCount} records`,
  );
}

/**
 * Process aggregation job
 */
async function processAggregation(job: Job<AggregationJobPayload>): Promise<void> {
  const { costRecordId, type } = job.data;

  console.log(`[AggregationWorker] Processing ${type}`);

  if (type === 'full_rebuild') {
    const mode = (process.env['AGGREGATION_REBUILD_MODE'] || 'server').toLowerCase();
    if (mode === 'legacy') {
      await rebuildAggregationsLegacy();
    } else {
      await rebuildAggregationsServerSide();
    }
  } else {
    await updateAggregation(costRecordId);
  }
}

/**
 * Create and start the aggregation worker
 */
export function createAggregationWorker(): Worker<AggregationJobPayload> {
  const connection = createRedisConnection();

  const worker = new Worker<AggregationJobPayload>(QUEUE_NAMES.AGGREGATION, processAggregation, {
    connection,
    concurrency: 3,
  });

  worker.on('completed', (job) => {
    console.log(`[AggregationWorker] Job ${job.id} completed`);
    backgroundJobsTotal.labels(QUEUE_NAMES.AGGREGATION, 'completed').inc();

    if (job.processedOn && job.finishedOn) {
      backgroundJobDuration
        .labels(QUEUE_NAMES.AGGREGATION)
        .observe((job.finishedOn - job.processedOn) / 1000);
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[AggregationWorker] Job ${job?.id} failed:`, err);
    backgroundJobsTotal.labels(QUEUE_NAMES.AGGREGATION, 'failed').inc();

    if (job?.processedOn && job?.finishedOn) {
      backgroundJobDuration
        .labels(QUEUE_NAMES.AGGREGATION)
        .observe((job.finishedOn - job.processedOn) / 1000);
    }
  });

  worker.on('error', (err) => {
    console.error('[AggregationWorker] Worker error:', err);
  });

  console.log('[AggregationWorker] Worker started');

  return worker;
}
