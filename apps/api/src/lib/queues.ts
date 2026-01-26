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

function attachQueueErrorHandler(queue: Queue, queueName: string): void {
  queue.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Queue:${queueName}] ${message}`);
  });
}

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

type QueueInstances = {
  extraction: Queue<ExtractionJobData>;
  anomalyDetection: Queue<AnomalyDetectionJobData>;
  alerts: Queue<AlertJobData>;
  aggregation: Queue<AggregationJobData>;
};

let queues: QueueInstances | null = null;

function createQueues(): QueueInstances {
  const extraction = new Queue<ExtractionJobData>(QUEUE_NAMES.EXTRACTION, {
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
  attachQueueErrorHandler(extraction, QUEUE_NAMES.EXTRACTION);

  const anomalyDetection = new Queue<AnomalyDetectionJobData>(QUEUE_NAMES.ANOMALY_DETECTION, {
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
  attachQueueErrorHandler(anomalyDetection, QUEUE_NAMES.ANOMALY_DETECTION);

  const alerts = new Queue<AlertJobData>(QUEUE_NAMES.ALERTS, {
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
  attachQueueErrorHandler(alerts, QUEUE_NAMES.ALERTS);

  const aggregation = new Queue<AggregationJobData>(QUEUE_NAMES.AGGREGATION, {
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
  attachQueueErrorHandler(aggregation, QUEUE_NAMES.AGGREGATION);

  return { extraction, anomalyDetection, alerts, aggregation };
}

function getQueues(): QueueInstances {
  if (!queues) {
    queues = createQueues();
  }
  return queues;
}

/**
 * Add an extraction job to the queue.
 */
export async function queueExtraction(
  data: ExtractionJobData,
  eventId: bigint | number,
): Promise<void> {
  const { extraction } = getQueues();
  await extraction.add('extract', data, {
    jobId: `outbox_${eventId}`, // Idempotency via unique job ID
  });
}

/**
 * Add an anomaly detection job to the queue.
 */
export async function queueAnomalyDetection(
  data: AnomalyDetectionJobData,
  eventId: bigint | number,
): Promise<void> {
  const { anomalyDetection } = getQueues();
  await anomalyDetection.add('detect', data, {
    jobId: `outbox_${eventId}`,
  });
}

/**
 * Add an alert job to the queue.
 */
export async function queueAlert(data: AlertJobData, eventId: bigint | number): Promise<void> {
  const { alerts } = getQueues();
  await alerts.add('send', data, {
    jobId: `outbox_${eventId}`,
  });
}

/**
 * Add an aggregation job to the queue.
 */
export async function queueAggregation(
  data: AggregationJobData,
  eventId: bigint | number,
): Promise<void> {
  const { aggregation } = getQueues();
  await aggregation.add('aggregate', data, {
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
  const { extraction, anomalyDetection, alerts, aggregation } = getQueues();

  const queue = (() => {
    switch (queueName) {
      case QUEUE_NAMES.EXTRACTION:
        return extraction;
      case QUEUE_NAMES.ANOMALY_DETECTION:
        return anomalyDetection;
      case QUEUE_NAMES.ALERTS:
        return alerts;
      case QUEUE_NAMES.AGGREGATION:
        return aggregation;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  })();

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
  if (!queues) return;

  await Promise.all([
    queues.extraction.close(),
    queues.anomalyDetection.close(),
    queues.alerts.close(),
    queues.aggregation.close(),
  ]);
  queues = null;
}
