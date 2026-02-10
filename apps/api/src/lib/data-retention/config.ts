import type { RetentionConfig } from './types.js';

const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  outboxEventRetentionDays: 30,
  dailyDigestRetentionDays: 30,
  loginAttemptRetentionDays: 90,
  passwordResetTokenRetentionDays: 7,
  auditLogRetentionDays: 365,
  archiveAuditLogs: false,
  batchSize: 1000,
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDefaultRetentionConfig(): RetentionConfig {
  return { ...DEFAULT_RETENTION_CONFIG };
}

export function getRetentionConfig(): RetentionConfig {
  return {
    outboxEventRetentionDays: parsePositiveIntEnv(
      'RETENTION_OUTBOX_DAYS',
      DEFAULT_RETENTION_CONFIG.outboxEventRetentionDays,
    ),
    dailyDigestRetentionDays: parsePositiveIntEnv(
      'RETENTION_DAILY_DIGEST_DAYS',
      DEFAULT_RETENTION_CONFIG.dailyDigestRetentionDays,
    ),
    loginAttemptRetentionDays: parsePositiveIntEnv(
      'RETENTION_LOGIN_ATTEMPT_DAYS',
      DEFAULT_RETENTION_CONFIG.loginAttemptRetentionDays,
    ),
    passwordResetTokenRetentionDays: parsePositiveIntEnv(
      'RETENTION_PASSWORD_RESET_DAYS',
      DEFAULT_RETENTION_CONFIG.passwordResetTokenRetentionDays,
    ),
    auditLogRetentionDays: parsePositiveIntEnv(
      'RETENTION_AUDIT_LOG_DAYS',
      DEFAULT_RETENTION_CONFIG.auditLogRetentionDays,
    ),
    archiveAuditLogs: process.env['RETENTION_ARCHIVE_AUDIT_LOGS'] === 'true',
    batchSize: parsePositiveIntEnv('RETENTION_BATCH_SIZE', DEFAULT_RETENTION_CONFIG.batchSize),
  };
}
