import { prisma } from '../lib/db.js';
import { queueExtraction, queueAnomalyDetection, queueAlert, queueAggregation } from '../lib/queues.js';
import { loadAlertSettings, shouldNotifySeverity } from '../lib/alert-settings.js';
import { resolveUserNotificationSettings } from '../lib/notification-settings.js';

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

const RECIPIENT_CACHE_TTL_MS = 60 * 1000;
let cachedEmailRecipients: Array<{ id: string; email: string }> | null = null;
let cachedEmailRecipientsAt = 0;

async function loadEmailRecipients(): Promise<Array<{ id: string; email: string }>> {
  const now = Date.now();
  if (cachedEmailRecipients && now - cachedEmailRecipientsAt < RECIPIENT_CACHE_TTL_MS) {
    return cachedEmailRecipients;
  }

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['admin', 'manager'] },
    },
    select: {
      id: true,
      email: true,
      notificationSettings: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const filtered = recipients.filter((user) => {
    const settings = resolveUserNotificationSettings(user.notificationSettings);
    return settings.emailAlertsEnabled;
  });

  cachedEmailRecipients = filtered.map((user) => ({ id: user.id, email: user.email }));
  cachedEmailRecipientsAt = now;
  return cachedEmailRecipients;
}

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'Kritisch';
    case 'warning':
      return 'Warnung';
    default:
      return 'Info';
  }
}

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

    const alertSettings = await loadAlertSettings();

    if (!shouldNotifySeverity(alertSettings, severity)) {
      return;
    }

    const channels: Array<'email' | 'slack' | 'teams'> = [];
    let emailRecipients: Array<{ id: string; email: string }> = [];
    let emailRecipientList = '';

    if (alertSettings.emailEnabled) {
      emailRecipients = await loadEmailRecipients();

      if (emailRecipients.length > 0) {
        emailRecipientList = emailRecipients.map((user) => user.email).join(', ');
        channels.push('email');
      }
    }

    const slackWebhookUrl = alertSettings.slackWebhookUrl.trim();
    if (alertSettings.slackEnabled && slackWebhookUrl) {
      channels.push('slack');
    }

    const teamsWebhookUrl = alertSettings.teamsWebhookUrl.trim();
    if (alertSettings.teamsEnabled && teamsWebhookUrl) {
      channels.push('teams');
    }

    if (channels.length === 0) {
      return;
    }

    const existingAlerts = await prisma.alert.findMany({
      where: {
        anomalyId,
        channel: { in: channels },
      },
      select: { channel: true },
    });
    const existingChannels = new Set(existingAlerts.map((alert) => alert.channel));

    for (const channel of channels) {
      if (existingChannels.has(channel)) {
        continue;
      }

      const recipient = channel === 'email'
        ? emailRecipientList
        : channel === 'slack'
          ? slackWebhookUrl
          : teamsWebhookUrl;

      if (!recipient) {
        continue;
      }

      const alert = await prisma.alert.create({
        data: {
          anomalyId,
          userId: channel === 'email' && emailRecipients.length === 1
            ? emailRecipients[0].id
            : null,
          channel,
          recipient,
          subject: `[${getSeverityLabel(severity)}] Kostenanomalie: ${message}`,
          body: message,
          status: 'pending',
        },
      });

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
   * Uses transactional claim-and-update to prevent race conditions.
   */
  private async processEvents(): Promise<void> {
    const processingTimeout = 5 * 60 * 1000; // 5 minutes timeout for stale claims

    // Atomic claim: SELECT FOR UPDATE SKIP LOCKED + UPDATE processingAt in one transaction
    const events = await prisma.$transaction(async (tx) => {
      // Find and lock events
      const claimed = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id
        FROM outbox_events
        WHERE processed_at IS NULL
          AND (processing_at IS NULL OR processing_at < NOW() - INTERVAL '${processingTimeout} milliseconds')
          AND next_attempt_at <= NOW()
          AND attempts < ${this.config.maxAttempts}
        ORDER BY created_at
        LIMIT ${this.config.batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      if (claimed.length === 0) return [];

      const claimedIds = claimed.map((e) => e.id);

      // Atomically mark as processing (claim the events)
      await tx.$executeRaw`
        UPDATE outbox_events
        SET processing_at = NOW()
        WHERE id = ANY(${claimedIds}::bigint[])
      `;

      // Return full event data
      return tx.$queryRaw<OutboxEventData[]>`
        SELECT
          id,
          aggregate_type as "aggregateType",
          aggregate_id as "aggregateId",
          event_type as "eventType",
          payload,
          created_at as "createdAt",
          attempts
        FROM outbox_events
        WHERE id = ANY(${claimedIds}::bigint[])
      `;
    });

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
   * Mark an event as processed (clears processingAt claim).
   */
  private async markProcessed(eventId: bigint): Promise<void> {
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        processedAt: new Date(),
        processingAt: null,
      },
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
          processingAt: null, // Clear claim for manual intervention
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
        processingAt: null, // Clear claim so it can be picked up after delay
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
