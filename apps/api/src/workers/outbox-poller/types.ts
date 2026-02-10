export interface OutboxPollerConfig {
  pollInterval?: number;
  batchSize?: number;
  maxAttempts?: number;
  concurrency?: number;
}

export interface OutboxEventData {
  id: bigint;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  attempts: number;
}

export type OutboxEventHandler = (event: OutboxEventData) => Promise<void>;
