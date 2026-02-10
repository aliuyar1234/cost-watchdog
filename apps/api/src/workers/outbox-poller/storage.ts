import { prisma } from '../../lib/db.js';
import { OUTBOX_PROCESSING_TIMEOUT_MS } from './config.js';
import type { OutboxEventData } from './types.js';

export async function claimOutboxEvents(
  batchSize: number,
  maxAttempts: number,
): Promise<OutboxEventData[]> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id
      FROM outbox_events
      WHERE processed_at IS NULL
        AND (processing_at IS NULL OR processing_at < NOW() - INTERVAL '${OUTBOX_PROCESSING_TIMEOUT_MS} milliseconds')
        AND next_attempt_at <= NOW()
        AND attempts < ${maxAttempts}
      ORDER BY created_at
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    if (claimed.length === 0) {
      return [];
    }

    const claimedIds = claimed.map((event) => event.id);

    await tx.$executeRaw`
      UPDATE outbox_events
      SET processing_at = NOW()
      WHERE id = ANY(${claimedIds}::bigint[])
    `;

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
}

export async function markOutboxEventProcessed(eventId: bigint): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id: eventId },
    data: {
      processedAt: new Date(),
      processingAt: null,
    },
  });
}

export async function scheduleOutboxEventRetry(
  eventId: bigint,
  errorMessage: string,
  maxAttempts: number,
): Promise<void> {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: eventId },
  });
  if (!event) {
    return;
  }

  const attempts = event.attempts + 1;
  if (attempts >= maxAttempts) {
    console.warn(`[OutboxPoller] Event ${eventId} exceeded max attempts, marking as failed`);
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        attempts,
        errorMessage: `Max attempts exceeded. Last error: ${errorMessage}`,
        processingAt: null,
      },
    });
    return;
  }

  const backoffMs = Math.pow(5, attempts) * 1000;
  const nextAttemptAt = new Date(Date.now() + backoffMs);

  await prisma.outboxEvent.update({
    where: { id: eventId },
    data: {
      attempts,
      nextAttemptAt,
      errorMessage,
      processingAt: null,
    },
  });

  console.log(
    `[OutboxPoller] Scheduled retry ${attempts}/${maxAttempts} for event ${eventId} at ${nextAttemptAt.toISOString()}`,
  );
}
