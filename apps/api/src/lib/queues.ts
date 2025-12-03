import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';

/**
 * Queue names used in the application.
 */
export const QUEUE_NAMES = {
  EXTRACTION: 'extraction',
  ANOMALY_DETECTION: 'anomaly-detection',
  ALERTS: 'alerts',
  AGGREGATION: 'aggregation',
} as const;

/**
 * Job data for document extraction.
 */
export interface ExtractionJobData {
  documentId: string;
  storagePath: string;
  mimeType: string;
  filename?: string;
  isBackfill?: boolean;
}

/**
 * Job data for anomaly detection.
 */
export interface AnomalyDetectionJobData {
  costRecordId: string;
  isBackfill?: boolean;
}

/**
 * Job data for alert sending.
 */
export interface AlertJobData {
  alertId: string;
  anomalyId: string;
  costRecordId: string;
}

/**
 * Job data for aggregation.
 */
export interface AggregationJobData {
  costRecordId: string;
  type: 'update' | 'full_rebuild';
}

/**
 * Extraction queue instance.
 */
export const extractionQueue = new Queue<ExtractionJobData>(QUEUE_NAMES.EXTRACTION, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

/**
 * Anomaly detection queue instance.
 */
export const anomalyQueue = new Queue<AnomalyDetectionJobData>(QUEUE_NAMES.ANOMALY_DETECTION, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

/**
 * Alert queue instance.
 */
export const alertQueue = new Queue<AlertJobData>(QUEUE_NAMES.ALERTS, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

/**
 * Aggregation queue instance.
 */
export const aggregationQueue = new Queue<AggregationJobData>(QUEUE_NAMES.AGGREGATION, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

/**
 * Add an extraction job to the queue.
 */
export async function queueExtraction(
  data: ExtractionJobData,
  eventId: bigint | number
): Promise<void> {
  await extractionQueue.add('extract', data, {
    jobId: `outbox_${eventId}`, // Idempotency via unique job ID
  });
}

/**
 * Add an anomaly detection job to the queue.
 */
export async function queueAnomalyDetection(
  data: AnomalyDetectionJobData,
  eventId: bigint | number
): Promise<void> {
  await anomalyQueue.add('detect', data, {
    jobId: `outbox_${eventId}`,
  });
}

/**
 * Add an alert job to the queue.
 */
export async function queueAlert(
  data: AlertJobData,
  eventId: bigint | number
): Promise<void> {
  await alertQueue.add('send', data, {
    jobId: `outbox_${eventId}`,
  });
}

/**
 * Add an aggregation job to the queue.
 */
export async function queueAggregation(
  data: AggregationJobData,
  eventId: bigint | number
): Promise<void> {
  await aggregationQueue.add('aggregate', data, {
    jobId: `outbox_${eventId}`,
  });
}

/**
 * Get queue statistics.
 */
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const queue =
    queueName === QUEUE_NAMES.EXTRACTION ? extractionQueue : anomalyQueue;

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

/**
 * Close all queue connections.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    extractionQueue.close(),
    anomalyQueue.close(),
    alertQueue.close(),
    aggregationQueue.close(),
  ]);
}
