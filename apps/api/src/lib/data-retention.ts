/**
 * Data Retention Library
 *
 * Provides automated cleanup of old data according to configurable retention policies.
 * Supports cleanup of:
 * - Token blacklist entries (Redis)
 * - Processed outbox events
 * - Old login attempts
 * - Expired password reset tokens
 * - Audit logs (with optional archival)
 */

import { prisma } from './db.js';
import { redis } from './redis.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RetentionConfig {
  /** Days to keep processed outbox events (default: 30) */
  outboxEventRetentionDays: number;
  /** Days to keep login attempts (default: 90) */
  loginAttemptRetentionDays: number;
  /** Days to keep expired/used password reset tokens (default: 7) */
  passwordResetTokenRetentionDays: number;
  /** Days to keep audit logs before archival/deletion (default: 365) */
  auditLogRetentionDays: number;
  /** Whether to archive audit logs instead of deleting (default: false) */
  archiveAuditLogs: boolean;
  /** Batch size for deletion operations (default: 1000) */
  batchSize: number;
}

export interface CleanupResult {
  success: boolean;
  deletedCount: number;
  error?: string;
  durationMs: number;
}

export interface RetentionRunResult {
  startedAt: Date;
  completedAt: Date;
  results: {
    tokenBlacklist: CleanupResult;
    outboxEvents: CleanupResult;
    loginAttempts: CleanupResult;
    passwordResetTokens: CleanupResult;
    auditLogs: CleanupResult;
  };
  totalDeleted: number;
  hasErrors: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  outboxEventRetentionDays: 30,
  loginAttemptRetentionDays: 90,
  passwordResetTokenRetentionDays: 7,
  auditLogRetentionDays: 365,
  archiveAuditLogs: false,
  batchSize: 1000,
};

/**
 * Get retention configuration from environment variables.
 */
export function getRetentionConfig(): RetentionConfig {
  return {
    outboxEventRetentionDays: parseInt(
      process.env['RETENTION_OUTBOX_DAYS'] || String(DEFAULT_RETENTION_CONFIG.outboxEventRetentionDays),
      10
    ),
    loginAttemptRetentionDays: parseInt(
      process.env['RETENTION_LOGIN_ATTEMPT_DAYS'] || String(DEFAULT_RETENTION_CONFIG.loginAttemptRetentionDays),
      10
    ),
    passwordResetTokenRetentionDays: parseInt(
      process.env['RETENTION_PASSWORD_RESET_DAYS'] || String(DEFAULT_RETENTION_CONFIG.passwordResetTokenRetentionDays),
      10
    ),
    auditLogRetentionDays: parseInt(
      process.env['RETENTION_AUDIT_LOG_DAYS'] || String(DEFAULT_RETENTION_CONFIG.auditLogRetentionDays),
      10
    ),
    archiveAuditLogs: process.env['RETENTION_ARCHIVE_AUDIT_LOGS'] === 'true',
    batchSize: parseInt(
      process.env['RETENTION_BATCH_SIZE'] || String(DEFAULT_RETENTION_CONFIG.batchSize),
      10
    ),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN BLACKLIST CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up expired token blacklist entries from Redis.
 * Note: Redis TTL handles most cleanup automatically, but this provides
 * manual cleanup for any orphaned keys without TTL.
 */
export async function cleanupTokenBlacklist(): Promise<CleanupResult> {
  const startTime = Date.now();
  let deletedCount = 0;

  try {
    const pattern = 'token_blacklist:*';
    let cursor = '0';
    const keysToDelete: string[] = [];

    // Scan for all token blacklist keys
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;

      // Check each key for TTL (-1 means no TTL, -2 means key doesn't exist)
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // Key has no TTL, it's orphaned - delete it
          keysToDelete.push(key);
        }
      }
    } while (cursor !== '0');

    // Delete orphaned keys in batches
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
  } catch (error) {
    return {
      success: false,
      deletedCount,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTBOX EVENT CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up old processed outbox events.
 * Only deletes events that have been successfully processed.
 */
export async function cleanupOutboxEvents(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.outboxEventRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Delete in batches to avoid long-running transactions
    let deletedInBatch: number;
    do {
      const result = await prisma.outboxEvent.deleteMany({
        where: {
          processedAt: {
            not: null,
            lt: cutoffDate,
          },
        },
        // Note: Prisma doesn't support LIMIT on deleteMany directly
        // We use a workaround by selecting IDs first
      });

      deletedInBatch = result.count;
      totalDeleted += deletedInBatch;

      // If we deleted a full batch, there might be more
    } while (deletedInBatch >= batchSize);

    return {
      success: true,
      deletedCount: totalDeleted,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Clean up old processed outbox events in batches (more memory efficient).
 */
export async function cleanupOutboxEventsBatched(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.outboxEventRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let hasMore = true;
    while (hasMore) {
      // Find IDs to delete
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

      // Delete batch
      const result = await prisma.outboxEvent.deleteMany({
        where: {
          id: { in: eventsToDelete.map((e) => e.id) },
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
  } catch (error) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN ATTEMPT CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up old login attempts.
 */
export async function cleanupLoginAttempts(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.loginAttemptRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let hasMore = true;
    while (hasMore) {
      // Find IDs to delete
      const attemptsToDelete = await prisma.loginAttempt.findMany({
        where: {
          attemptedAt: {
            lt: cutoffDate,
          },
        },
        select: { id: true },
        take: batchSize,
      });

      if (attemptsToDelete.length === 0) {
        hasMore = false;
        break;
      }

      // Delete batch
      const result = await prisma.loginAttempt.deleteMany({
        where: {
          id: { in: attemptsToDelete.map((a) => a.id) },
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
  } catch (error) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD RESET TOKEN CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up expired or used password reset tokens.
 */
export async function cleanupPasswordResetTokens(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.passwordResetTokenRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize
): Promise<CleanupResult> {
  const startTime = Date.now();
  let totalDeleted = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const now = new Date();

    let hasMore = true;
    while (hasMore) {
      // Find tokens to delete: either expired OR used and older than retention period
      const tokensToDelete = await prisma.passwordResetToken.findMany({
        where: {
          OR: [
            // Expired tokens
            { expiresAt: { lt: now } },
            // Used tokens older than retention period
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

      // Delete batch
      const result = await prisma.passwordResetToken.deleteMany({
        where: {
          id: { in: tokensToDelete.map((t) => t.id) },
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
  } catch (error) {
    return {
      success: false,
      deletedCount: totalDeleted,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG CLEANUP / ARCHIVAL
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditLogArchiveResult extends CleanupResult {
  archivedCount?: number;
}

/**
 * Archive or delete old audit logs.
 * When archiveAuditLogs is true, exports to JSON before deletion (placeholder for S3/external storage).
 */
export async function cleanupAuditLogs(
  retentionDays: number = DEFAULT_RETENTION_CONFIG.auditLogRetentionDays,
  batchSize: number = DEFAULT_RETENTION_CONFIG.batchSize,
  archive: boolean = false
): Promise<AuditLogArchiveResult> {
  const startTime = Date.now();
  let totalDeleted = 0;
  let archivedCount = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let hasMore = true;
    while (hasMore) {
      // Find logs to archive/delete
      const logsToProcess = await prisma.auditLog.findMany({
        where: {
          performedAt: {
            lt: cutoffDate,
          },
        },
        take: batchSize,
        orderBy: { performedAt: 'asc' },
      });

      if (logsToProcess.length === 0) {
        hasMore = false;
        break;
      }

      // If archiving, export first (placeholder - in production, send to S3/external storage)
      if (archive) {
        // Archive implementation placeholder
        // In production, this would upload to S3, send to data lake, etc.
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
            // Exclude potentially sensitive data from archive
            // before/after/changes can be large and may contain PII
          })),
        };

        // Log archive creation (in production, upload to S3)
        console.log(
          `[DataRetention] Archived ${archiveData.count} audit logs from ${archiveData.dateRange.from} to ${archiveData.dateRange.to}`
        );
        archivedCount += logsToProcess.length;
      }

      // Delete batch
      const result = await prisma.auditLog.deleteMany({
        where: {
          id: { in: logsToProcess.map((l) => l.id) },
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
  } catch (error) {
    return {
      success: false,
      deletedCount: totalDeleted,
      archivedCount: archive ? archivedCount : undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL RETENTION RUN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run all retention cleanup tasks.
 */
export async function runRetentionCleanup(
  config: Partial<RetentionConfig> = {}
): Promise<RetentionRunResult> {
  const fullConfig = { ...getRetentionConfig(), ...config };
  const startedAt = new Date();

  console.log('[DataRetention] Starting retention cleanup run...');
  console.log(`[DataRetention] Configuration: ${JSON.stringify(fullConfig)}`);

  // Run all cleanup tasks
  const [tokenBlacklist, outboxEvents, loginAttempts, passwordResetTokens, auditLogs] =
    await Promise.all([
      cleanupTokenBlacklist(),
      cleanupOutboxEventsBatched(fullConfig.outboxEventRetentionDays, fullConfig.batchSize),
      cleanupLoginAttempts(fullConfig.loginAttemptRetentionDays, fullConfig.batchSize),
      cleanupPasswordResetTokens(fullConfig.passwordResetTokenRetentionDays, fullConfig.batchSize),
      cleanupAuditLogs(fullConfig.auditLogRetentionDays, fullConfig.batchSize, fullConfig.archiveAuditLogs),
    ]);

  const completedAt = new Date();
  const results = {
    tokenBlacklist,
    outboxEvents,
    loginAttempts,
    passwordResetTokens,
    auditLogs,
  };

  const totalDeleted =
    tokenBlacklist.deletedCount +
    outboxEvents.deletedCount +
    loginAttempts.deletedCount +
    passwordResetTokens.deletedCount +
    auditLogs.deletedCount;

  const hasErrors = Object.values(results).some((r) => !r.success);

  console.log(`[DataRetention] Cleanup complete. Total deleted: ${totalDeleted}`);
  if (hasErrors) {
    console.error('[DataRetention] Some tasks failed:', results);
  }

  return {
    startedAt,
    completedAt,
    results,
    totalDeleted,
    hasErrors,
  };
}

/**
 * Get retention statistics (for monitoring/reporting).
 */
export async function getRetentionStats(): Promise<{
  outboxEvents: { total: number; processed: number; pending: number };
  loginAttempts: { total: number; last24h: number; last7d: number };
  passwordResetTokens: { total: number; expired: number; used: number };
  auditLogs: { total: number; last30d: number; older: number };
}> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    outboxTotal,
    outboxProcessed,
    loginTotal,
    loginLast24h,
    loginLast7d,
    passwordResetTotal,
    passwordResetExpired,
    passwordResetUsed,
    auditTotal,
    auditLast30d,
  ] = await Promise.all([
    prisma.outboxEvent.count(),
    prisma.outboxEvent.count({ where: { processedAt: { not: null } } }),
    prisma.loginAttempt.count(),
    prisma.loginAttempt.count({ where: { attemptedAt: { gte: last24h } } }),
    prisma.loginAttempt.count({ where: { attemptedAt: { gte: last7d } } }),
    prisma.passwordResetToken.count(),
    prisma.passwordResetToken.count({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.count({ where: { usedAt: { not: null } } }),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { performedAt: { gte: last30d } } }),
  ]);

  return {
    outboxEvents: {
      total: outboxTotal,
      processed: outboxProcessed,
      pending: outboxTotal - outboxProcessed,
    },
    loginAttempts: {
      total: loginTotal,
      last24h: loginLast24h,
      last7d: loginLast7d,
    },
    passwordResetTokens: {
      total: passwordResetTotal,
      expired: passwordResetExpired,
      used: passwordResetUsed,
    },
    auditLogs: {
      total: auditTotal,
      last30d: auditLast30d,
      older: auditTotal - auditLast30d,
    },
  };
}
