import { DEFAULT_OUTBOX_POLLER_CONFIG } from './config.js';
import { EVENT_HANDLERS } from './handlers.js';
import {
  claimOutboxEvents,
  markOutboxEventProcessed,
  scheduleOutboxEventRetry,
} from './storage.js';
import type { OutboxEventData, OutboxPollerConfig } from './types.js';

export class OutboxPoller {
  private config: Required<OutboxPollerConfig>;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(config: OutboxPollerConfig = {}) {
    this.config = { ...DEFAULT_OUTBOX_POLLER_CONFIG, ...config };
  }

  start(): void {
    if (this.isRunning) {
      console.log('[OutboxPoller] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[OutboxPoller] Started');
    void this.poll();
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[OutboxPoller] Stopped');
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.processEvents();
    } catch (error) {
      console.error('[OutboxPoller] Error processing events:', error);
    }

    this.pollTimer = setTimeout(() => {
      void this.poll();
    }, this.config.pollInterval);
  }

  private async processEvents(): Promise<void> {
    const events = await claimOutboxEvents(this.config.batchSize, this.config.maxAttempts);
    if (events.length === 0) {
      return;
    }

    console.log(`[OutboxPoller] Processing ${events.length} events`);

    for (let i = 0; i < events.length; i += this.config.concurrency) {
      const slice = events.slice(i, i + this.config.concurrency);
      await Promise.all(slice.map((event) => this.processEvent(event)));
    }
  }

  private async processEvent(event: OutboxEventData): Promise<void> {
    const handler = EVENT_HANDLERS[event.eventType];
    if (!handler) {
      console.warn(`[OutboxPoller] No handler for event type: ${event.eventType}`);
      await markOutboxEventProcessed(event.id);
      return;
    }

    try {
      await handler(event);
      await markOutboxEventProcessed(event.id);
      console.log(`[OutboxPoller] Processed event ${event.id} (${event.eventType})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[OutboxPoller] Failed to process event ${event.id}:`, errorMessage);
      await scheduleOutboxEventRetry(event.id, errorMessage, this.config.maxAttempts);
    }
  }
}

export function createOutboxPoller(config?: OutboxPollerConfig): OutboxPoller {
  return new OutboxPoller(config);
}
