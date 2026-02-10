import { prisma } from '../../lib/db.js';
import type { ClaimDigestRecordParams } from './types.js';

export async function claimDigestRecord(
  params: ClaimDigestRecordParams,
): Promise<{ id: string } | null> {
  const now = new Date();
  const leaseMs = 10 * 60 * 1000;
  const staleBefore = new Date(now.getTime() - leaseMs);

  const claimResult = await prisma.dailyDigest.updateMany({
    where: {
      digestKey: params.digestKey,
      channel: params.channel,
      recipient: params.recipient,
      attempts: { lt: params.maxAttempts },
      OR: [
        { status: { in: ['pending', 'failed'] } },
        { status: 'processing', lastAttemptAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: 'processing',
      attempts: { increment: 1 },
      lastAttemptAt: now,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      errorMessage: null,
      userId: params.userId ?? null,
    },
  });

  if (claimResult.count === 1) {
    return prisma.dailyDigest.findUnique({
      where: {
        digestKey_channel_recipient: {
          digestKey: params.digestKey,
          channel: params.channel,
          recipient: params.recipient,
        },
      },
      select: { id: true },
    });
  }

  const existing = await prisma.dailyDigest.findUnique({
    where: {
      digestKey_channel_recipient: {
        digestKey: params.digestKey,
        channel: params.channel,
        recipient: params.recipient,
      },
    },
    select: { id: true, status: true, attempts: true, lastAttemptAt: true },
  });

  if (existing) {
    return null;
  }

  try {
    return await prisma.dailyDigest.create({
      data: {
        digestKey: params.digestKey,
        channel: params.channel,
        recipient: params.recipient,
        userId: params.userId ?? null,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        status: 'processing',
        attempts: 1,
        lastAttemptAt: now,
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    ) {
      return null;
    }
    throw error;
  }
}

export async function markDigestSent(id: string): Promise<void> {
  await prisma.dailyDigest.update({
    where: { id },
    data: {
      status: 'sent',
      sentAt: new Date(),
      errorMessage: null,
    },
  });
}

export async function markDigestFailed(id: string, error: string): Promise<void> {
  await prisma.dailyDigest.update({
    where: { id },
    data: {
      status: 'failed',
      errorMessage: error,
    },
  });
}
