import { createExtractionWorker } from './extraction.worker.js';
import { createAnomalyWorker } from './anomaly.worker.js';
import { createAlertWorker } from './alert.worker.js';
import { createAggregationWorker } from './aggregation.worker.js';
import { createOutboxPoller } from './outbox-poller.js';
import { createRetentionWorker } from './retention.worker.js';
import { closeQueues } from '../lib/queues.js';
import { closeRedis } from '../lib/redis.js';
import { disconnectDatabase } from '../lib/db.js';

/**
 * Start all workers and the outbox poller.
 *
 * Usage: npx tsx src/workers/index.ts
 */
async function main(): Promise<void> {
  console.log('[Workers] Starting worker processes...');

  // Start extraction worker
  const extractionWorker = createExtractionWorker();

  // Start anomaly detection worker
  const anomalyWorker = createAnomalyWorker();

  // Start alert worker
  const alertWorker = createAlertWorker();

  // Start aggregation worker
  const aggregationWorker = createAggregationWorker();

  // Start outbox poller
  const outboxPoller = createOutboxPoller({
    pollInterval: 1000,
    batchSize: 50,
    maxAttempts: 5,
  });
  outboxPoller.start();

  // Start retention worker (scheduled cleanup)
  const retentionWorker = createRetentionWorker({
    schedule: process.env['RETENTION_CRON_SCHEDULE'] || '0 3 * * *', // 3 AM daily
    runOnStartup: process.env['RETENTION_RUN_ON_STARTUP'] === 'true',
  });
  await retentionWorker.start();

  console.log('[Workers] All workers started');

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[Workers] Received ${signal}, shutting down...`);

    // Stop polling and scheduled tasks
    outboxPoller.stop();
    retentionWorker.stop();

    // Close workers
    await Promise.all([
      extractionWorker.close(),
      anomalyWorker.close(),
      alertWorker.close(),
      aggregationWorker.close(),
    ]);

    // Close queues and connections
    await closeQueues();
    await closeRedis();
    await disconnectDatabase();

    console.log('[Workers] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  process.stdin.resume();
}

main().catch((error) => {
  console.error('[Workers] Fatal error:', error);
  process.exit(1);
});
