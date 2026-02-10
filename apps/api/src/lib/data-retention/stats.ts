import { prisma } from '../db.js';
import type { RetentionStats } from './types.js';

export async function getRetentionStats(): Promise<RetentionStats> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    outboxTotal,
    outboxProcessed,
    dailyDigestTotal,
    dailyDigestLast30d,
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
    prisma.dailyDigest.count(),
    prisma.dailyDigest.count({ where: { createdAt: { gte: last30d } } }),
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
    dailyDigests: {
      total: dailyDigestTotal,
      last30d: dailyDigestLast30d,
      older: dailyDigestTotal - dailyDigestLast30d,
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
