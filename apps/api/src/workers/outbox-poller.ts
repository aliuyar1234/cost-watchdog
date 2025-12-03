import { prisma } from '../lib/db.js';
import { queueExtraction, queueAnomalyDetection, queueAlert, queueAggregation } from '../lib/queues.js';

/**
 * Configuration for the outbox poller.
 */
export interface OutboxPollerConfig {
  /** Polling interval in milliseconds */
  pollInterval?: number;
  /** Maximum events to process per batch */
  batchSize?: number;
  /** Maximum retry attempts before dead-letter */
  maxAttempts?: number;
}

const DEFAULT_CONFIG: Required<OutboxPollerConfig> = {
  pollInterval: 1000,
  batchSize: 100,
  maxAttempts: 5,
};

/**
 * Outbox event types and their handlers.
 */
const EVENT_HANDLERS: Record<string, (event: OutboxEventData) => Promise<void>> = {
  'document.uploaded': async (event) => {
    await queueExtraction(
      {
        documentId: event.payload['documentId'] as string,
        storagePath: event.payload['storagePath'] as string,
        mimeType: event.payload['mimeType'] as string,
        filename: event.payload['filename'] as string,
      },
      event.id
    );
  },
  'document.extraction_retry': async (event) => {
    await queueExtraction(
      {
        documentId: event.payload['documentId'] as string,
        storagePath: event.payload['storagePath'] as string,
        mimeType: event.payload['mimeType'] as string,
      },
      event.id
    );
  },
  'cost_record.created': async (event) => {
    // Queue anomaly detection
    await queueAnomalyDetection(
      {
        costRecordId: event.payload['costRecordId'] as string,
        isBackfill: event.payload['isBackfill'] as boolean,
      },
      event.id
    );

    // Queue aggregation update
    await queueAggregation(
      {
        costRecordId: event.payload['costRecordId'] as string,
        type: 'update',
      },
      event.id
    );
  },
  'anomaly.detected': async (event) => {
    // Create alert record and queue for sending
    const anomalyId = event.aggregateId;
    const costRecordId = event.payload['costRecordId'] as string;
    const severity = event.payload['severity'] as string;
    const message = event.payload['message'] as string;

    // Only create alerts for warning and critical severity
    if (severity !== 'warning' && severity !== 'critical') {
      return;
    }

    // Get users to notify (for now, just the first admin user)
    // TODO: Implement proper notification preferences
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['admin', 'manager'] },
      },
      take: 5,
    });

    for (const user of users) {
      // Create alert record
      const alert = await prisma.alert.create({
        data: {
          anomalyId,
          userId: user.id,
          channel: 'email',
          recipient: user.email,
          subject: `[${severity === 'critical' ? 'Kritisch' : 'Warnung'}] Kostenanomalie: ${message}`,
          body: message,
          status: 'pending',
        },
      });

      // Queue alert for sending
      await queueAlert(
        {
          alertId: alert.id,
          anomalyId,
          costRecordId,
        },
        event.id
      );
    }
  },
  'alert.retry': async (event) => {
    const alertId = event.payload['alertId'] as string;
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { anomaly: true },
    });

    if (!alert) return;

    await queueAlert(
      {
        alertId: alert.id,
        anomalyId: alert.anomalyId,
        costRecordId: alert.anomaly.costRecordId,
      },
      event.id
    );
  },
};

interface OutboxEventData {
  id: bigint;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  attempts: number;
}

/**
 * Outbox poller class.
 * Polls the outbox table and dispatches events to appropriate queues.
 */
export class OutboxPoller {
  private config: Required<OutboxPollerConfig>;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(config: OutboxPollerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start polling the outbox table.
   */
  start(): void {
    if (this.isRunning) {
      console.log('[OutboxPoller] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[OutboxPoller] Started');
    this.poll();
  }

  /**
   * Stop polling.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[OutboxPoller] Stopped');
  }

  /**
   * Poll for unprocessed events.
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processEvents();
    } catch (error) {
      console.error('[OutboxPoller] Error processing events:', error);
    }

    // Schedule next poll
    this.pollTimer = setTimeout(() => this.poll(), this.config.pollInterval);
  }

  /**
   * Process a batch of events.
   */
  private async processEvents(): Promise<void> {
    // Claim events with FOR UPDATE SKIP LOCKED
    const events = await prisma.$queryRaw<OutboxEventData[]>`
      WITH claimed AS (
        SELECT id
        FROM outbox_events
        WHERE processed_at IS NULL
          AND next_attempt_at <= NOW()
          AND attempts < ${this.config.maxAttempts}
        ORDER BY created_at
        LIMIT ${this.config.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      SELECT
        e.id,
        e.aggregate_type as "aggregateType",
        e.aggregate_id as "aggregateId",
        e.event_type as "eventType",
        e.payload,
        e.created_at as "createdAt",
        e.attempts
      FROM outbox_events e
      WHERE e.id IN (SELECT id FROM claimed)
    `;

    if (events.length === 0) return;

    console.log(`[OutboxPoller] Processing ${events.length} events`);

    for (const event of events) {
      await this.processEvent(event);
    }
  }

  /**
   * Process a single event.
   */
  private async processEvent(event: OutboxEventData): Promise<void> {
    const handler = EVENT_HANDLERS[event.eventType];

    if (!handler) {
      console.warn(`[OutboxPoller] No handler for event type: ${event.eventType}`);
      await this.markProcessed(event.id);
      return;
    }

    try {
      await handler(event);
      await this.markProcessed(event.id);
      console.log(`[OutboxPoller] Processed event ${event.id} (${event.eventType})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[OutboxPoller] Failed to process event ${event.id}:`, errorMessage);
      await this.scheduleRetry(event.id, errorMessage);
    }
  }

  /**
   * Mark an event as processed.
   */
  private async markProcessed(eventId: bigint): Promise<void> {
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }

  /**
   * Schedule a retry with exponential backoff.
   */
  private async scheduleRetry(eventId: bigint, errorMessage: string): Promise<void> {
    const event = await prisma.outboxEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) return;

    const newAttempts = event.attempts + 1;

    if (newAttempts >= this.config.maxAttempts) {
      // Move to dead letter (just mark as failed for now)
      console.warn(`[OutboxPoller] Event ${eventId} exceeded max attempts, marking as failed`);
      await prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          attempts: newAttempts,
          errorMessage: `Max attempts exceeded. Last error: ${errorMessage}`,
          // Don't mark as processed so it can be manually retried
        },
      });
      return;
    }

    // Exponential backoff: 5s, 25s, 125s, 625s...
    const backoffMs = Math.pow(5, newAttempts) * 1000;
    const nextAttemptAt = new Date(Date.now() + backoffMs);

    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        attempts: newAttempts,
        nextAttemptAt,
        errorMessage,
      },
    });

    console.log(
      `[OutboxPoller] Scheduled retry ${newAttempts}/${this.config.maxAttempts} for event ${eventId} at ${nextAttemptAt.toISOString()}`
    );
  }
}

/**
 * Create and return an outbox poller instance.
 */
export function createOutboxPoller(config?: OutboxPollerConfig): OutboxPoller {
  return new OutboxPoller(config);
}
