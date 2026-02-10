import type { OutboxPollerConfig } from './types.js';

export const DEFAULT_OUTBOX_POLLER_CONFIG: Required<OutboxPollerConfig> = {
  pollInterval: 1000,
  batchSize: 100,
  maxAttempts: 5,
  concurrency: 5,
};

export const OUTBOX_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
