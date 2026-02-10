import { prisma } from '../db.js';
import { redis } from '../redis.js';
import { getDefaultRetentionConfig } from './config.js';
import type { AuditLogArchiveResult, CleanupResult } from './types.js';

const DEFAULT_RETENTION_CONFIG = getDefaultRetentionConfig();

export async function cleanupTokenBlacklist(): Promise<CleanupResult> {
  const startTime = Date.now();
  let deletedCount = 0;

  try {
    const pattern = 'token_blacklist:*';
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          keysToDelete.push(key);
        }
      }
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keysToDelete) {
        pipeline.del(key);
      }
      await pipeline.exec();
      deletedCount = keysToDelete.length;
    }

    return {
      success: true,
      deletedCount,
      durationMs: Date.now() - startTime,
    };
  } catch (cause) {
    return {
      success: false,
      deletedCount,
      error: cause instanceof Error ? cause.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function cleanupOutboxEvents(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.outboxEventRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize,
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedInBatch: number;
    do {
      const result = await prisma.outboxEvent.deleteMany({
        where: {
          processedAt: {
            not: null,
            lt: cutoffDate,
          },
        },
      });

      deletedInBatch = result.count;
      totalDeleted += deletedInBatch;
    } while (deletedInBatch >= batchSize);

    return {
      success: true,
      deletedCount: totalDeleted,
      durationMs: Date.now() - startTime,
    };
  } catch (cause) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: cause instanceof Error ? cause.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function cleanupOutboxEventsBatched(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.outboxEventRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize,
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let hasMore = true;
    while (hasMore) {
      const eventsToDelete = await prisma.outboxEvent.findMany({
        where: {
          processedAt: {
            not: null,
            lt: cutoffDate,
          },
        },
        select: { id: true },
        take: batchSize,
      });

      if (eventsToDelete.length === 0) {
        hasMore = false;
        break;
      }

      const result = await prisma.outboxEvent.deleteMany({
        where: {
          id: { in: eventsToDelete.map((event) => event.id) },
        },
      });

      totalDeleted += result.count;
      hasMore = eventsToDelete.length === batchSize;
    }

    return {
      success: true,
      deletedCount: totalDeleted,
      durationMs: Date.now() - startTime,
    };
  } catch (cause) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: cause instanceof Error ? cause.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function cleanupDailyDigests(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.dailyDigestRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize,
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let hasMore = true;
    while (hasMore) {
      const digestsToDelete = await prisma.dailyDigest.findMany({
        where: { createdAt: { lt: cutoffDate } },
        select: { id: true },
        take: batchSize,
      });

      if (digestsToDelete.length === 0) {
        hasMore = false;
        break;
      }

      const result = await prisma.dailyDigest.deleteMany({
        where: {
          id: { in: digestsToDelete.map((digest) => digest.id) },
        },
      });

      totalDeleted += result.count;
      hasMore = digestsToDelete.length === batchSize;
    }

    return {
      success: true,
      deletedCount: totalDeleted,
      durationMs: Date.now() - startTime,
    };
  } catch (cause) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: cause instanceof Error ? cause.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function cleanupLoginAttempts(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.loginAttemptRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize,
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let hasMore = true;
    while (hasMore) {
      const attemptsToDelete = await prisma.loginAttempt.findMany({
        where: {
          attemptedAt: { lt: cutoffDate },
        },
        select: { id: true },
        take: batchSize,
      });

      if (attemptsToDelete.length === 0) {
        hasMore = false;
        break;
      }

      const result = await prisma.loginAttempt.deleteMany({
        where: {
          id: { in: attemptsToDelete.map((attempt) => attempt.id) },
        },
      });

      totalDeleted += result.count;
      hasMore = attemptsToDelete.length === batchSize;
    }

    return {
      success: true,
      deletedCount: totalDeleted,
      durationMs: Date.now() - startTime,
    };
  } catch (cause) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: cause instanceof Error ? cause.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function cleanupPasswordResetTokens(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.passwordResetTokenRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize,
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const now = new Date();

    let hasMore = true;
    while (hasMore) {
      const tokensToDelete = await prisma.passwordResetToken.findMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            {
              usedAt: { not: null },
              createdAt: { lt: cutoffDate },
            },
          ],
        },
        select: { id: true },
        take: batchSize,
      });

      if (tokensToDelete.length === 0) {
        hasMore = false;
        break;
      }

      const result = await prisma.passwordResetToken.deleteMany({
        where: {
          id: { in: tokensToDelete.map((token) => token.id) },
        },
      });

      totalDeleted += result.count;
      hasMore = tokensToDelete.length === batchSize;
    }

    return {
      success: true,
      deletedCount: totalDeleted,
      durationMs: Date.now() - startTime,
    };
  } catch (cause) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: cause instanceof Error ? cause.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function cleanupAuditLogs(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.auditLogRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize,
  archive: boolean = false,
): Promise<AuditLogArchiveResult> {
  const startTime = Date.now();
  let totalDeleted = 0;
  let archivedCount = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let hasMore = true;
    while (hasMore) {
      const logsToProcess = await prisma.auditLog.findMany({
        where: {
          performedAt: { lt: cutoffDate },
        },
        take: batchSize,
        orderBy: { performedAt: 'asc' },
      });

      if (logsToProcess.length === 0) {
        hasMore = false;
        break;
      }

      if (archive) {
        const archiveData = {
          exportedAt: new Date().toISOString(),
          count: logsToProcess.length,
          dateRange: {
            from: logsToProcess[0]!.performedAt.toISOString(),
            to: logsToProcess[logsToProcess.length - 1]!.performedAt.toISOString(),
          },
          logs: logsToProcess.map((log) => ({
            id: log.id,
            entityType: log.entityType,
            entityId: log.entityId,
            action: log.action,
            performedBy: log.performedBy,
            performedAt: log.performedAt.toISOString(),
            metadata: log.metadata,
          })),
        };

        console.log(
          `[DataRetention] Archived ${archiveData.count} audit logs from ${archiveData.dateRange.from} to ${archiveData.dateRange.to}`,
        );
        archivedCount += logsToProcess.length;
      }

      const result = await prisma.auditLog.deleteMany({
        where: {
          id: { in: logsToProcess.map((log) => log.id) },
        },
      });

      totalDeleted += result.count;
      hasMore = logsToProcess.length === batchSize;
    }

    return {
      success: true,
      deletedCount: totalDeleted,
      archivedCount: archive ? archivedCount : undefined,
      durationMs: Date.now() - startTime,
    };
  } catch (cause) {
    return {
      success: false,
      deletedCount: totalDeleted,
      archivedCount: archive ? archivedCount : undefined,
      error: cause instanceof Error ? cause.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}
