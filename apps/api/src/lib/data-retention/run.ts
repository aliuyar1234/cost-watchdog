import { getRetentionConfig } from './config.js';
import {
  cleanupAuditLogs,
  cleanupDailyDigests,
  cleanupLoginAttempts,
  cleanupOutboxEventsBatched,
  cleanupPasswordResetTokens,
  cleanupTokenBlacklist,
} from './cleanup.js';
import type { RetentionConfig, RetentionRunResult } from './types.js';

export async function runRetentionCleanup(
  config: Partial<RetentionConfig> = {},
): Promise<RetentionRunResult> {
  const fullConfig = { ...getRetentionConfig(), ...config };
  const startedAt = new Date();

  console.log('[DataRetention] Starting retention cleanup run...');
  console.log(`[DataRetention] Configuration: ${JSON.stringify(fullConfig)}`);

  const [
    tokenBlacklist,
    outboxEvents,
    dailyDigests,
    loginAttempts,
    passwordResetTokens,
    auditLogs,
  ] = await Promise.all([
    cleanupTokenBlacklist(),
    cleanupOutboxEventsBatched(fullConfig.outboxEventRetentionDays, fullConfig.batchSize),
    cleanupDailyDigests(fullConfig.dailyDigestRetentionDays, fullConfig.batchSize),
    cleanupLoginAttempts(fullConfig.loginAttemptRetentionDays, fullConfig.batchSize),
    cleanupPasswordResetTokens(fullConfig.passwordResetTokenRetentionDays, fullConfig.batchSize),
    cleanupAuditLogs(
      fullConfig.auditLogRetentionDays,
      fullConfig.batchSize,
      fullConfig.archiveAuditLogs,
    ),
  ]);

  const completedAt = new Date();
  const results = {
    tokenBlacklist,
    outboxEvents,
    dailyDigests,
    loginAttempts,
    passwordResetTokens,
    auditLogs,
  };

  const totalDeleted =
    tokenBlacklist.deletedCount +
    outboxEvents.deletedCount +
    dailyDigests.deletedCount +
    loginAttempts.deletedCount +
    passwordResetTokens.deletedCount +
    auditLogs.deletedCount;

  const hasErrors = Object.values(results).some((result) => !result.success);
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
