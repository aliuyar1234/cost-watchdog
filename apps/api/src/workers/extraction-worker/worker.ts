import { Worker } from 'bullmq';
import { createRedisConnection } from '../../lib/redis.js';
import { QUEUE_NAMES, type ExtractionJobData } from '../../lib/queues.js';
import { backgroundJobDuration, backgroundJobsTotal } from '../../lib/metrics.js';
import { processExtractionJob } from './process-job.js';

export function createExtractionWorker(): Worker<ExtractionJobData> {
  const worker = new Worker<ExtractionJobData>(QUEUE_NAMES.EXTRACTION, processExtractionJob, {
    connection: createRedisConnection(),
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on('completed', (job) => {
    console.log(`[Extraction] Job ${job.id} completed`);
    backgroundJobsTotal.labels(QUEUE_NAMES.EXTRACTION, 'completed').inc();

    if (job.processedOn && job.finishedOn) {
      backgroundJobDuration
        .labels(QUEUE_NAMES.EXTRACTION)
        .observe((job.finishedOn - job.processedOn) / 1000);
    }
  });

  worker.on('failed', (job, error) => {
    console.error(`[Extraction] Job ${job?.id} failed:`, error.message);
    backgroundJobsTotal.labels(QUEUE_NAMES.EXTRACTION, 'failed').inc();

    if (job?.processedOn && job?.finishedOn) {
      backgroundJobDuration
        .labels(QUEUE_NAMES.EXTRACTION)
        .observe((job.finishedOn - job.processedOn) / 1000);
    }
  });

  worker.on('error', (error) => {
    console.error('[Extraction] Worker error:', error);
  });

  console.log('[Extraction] Worker started');
  return worker;
}
