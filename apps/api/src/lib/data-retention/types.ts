export interface RetentionConfig {
  outboxEventRetentionDays: number;
  dailyDigestRetentionDays: number;
  loginAttemptRetentionDays: number;
  passwordResetTokenRetentionDays: number;
  auditLogRetentionDays: number;
  archiveAuditLogs: boolean;
  batchSize: number;
}

export interface CleanupResult {
  success: boolean;
  deletedCount: number;
  error?: string;
  durationMs: number;
}

export interface AuditLogArchiveResult extends CleanupResult {
  archivedCount?: number;
}

export interface RetentionRunResult {
  startedAt: Date;
  completedAt: Date;
  results: {
    tokenBlacklist: CleanupResult;
    outboxEvents: CleanupResult;
    dailyDigests: CleanupResult;
    loginAttempts: CleanupResult;
    passwordResetTokens: CleanupResult;
    auditLogs: CleanupResult;
  };
  totalDeleted: number;
  hasErrors: boolean;
}

export interface RetentionStats {
  outboxEvents: { total: number; processed: number; pending: number };
  dailyDigests: { total: number; last30d: number; older: number };
  loginAttempts: { total: number; last24h: number; last7d: number };
  passwordResetTokens: { total: number; expired: number; used: number };
  auditLogs: { total: number; last30d: number; older: number };
}
