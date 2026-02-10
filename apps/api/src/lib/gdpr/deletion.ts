import { logAuditEvent } from '../audit.js';
import { prisma } from '../db.js';
import { isLastActiveAdmin } from './admin.js';
import { anonymizeAuditLogs } from './audit-logs.js';
import { flagDocumentsForReview } from './documents.js';
import { removeUserPii } from './pii.js';
import { terminateUserSessions } from './sessions.js';
import type { GdprDeletionOptions, GdprDeletionResult } from './types.js';

interface GdprDeletionValidation {
  canDelete: boolean;
  reason?: string;
}

interface GdprDeletionCandidate {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  deletedAt: Date | null;
}

const USER_NOT_FOUND = 'User not found';
const USER_ALREADY_DELETED = 'User already deleted';
const LAST_ADMIN = 'Cannot delete the last active admin';
const DEFAULT_REASON = 'User requested deletion';

function failureResult(
  userId: string,
  error: string,
  deletedAt: Date = new Date(),
): GdprDeletionResult {
  return {
    success: false,
    userId,
    deletedAt,
    anonymizedAuditLogs: 0,
    terminatedSessions: 0,
    flaggedDocuments: 0,
    error,
  };
}

async function getDeletionCandidate(userId: string): Promise<GdprDeletionCandidate | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      deletedAt: true,
    },
  });
}

export async function canPerformGdprDeletion(userId: string): Promise<GdprDeletionValidation> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true },
  });

  if (!user) {
    return { canDelete: false, reason: USER_NOT_FOUND };
  }

  if (user.deletedAt) {
    return { canDelete: false, reason: USER_ALREADY_DELETED };
  }

  if (await isLastActiveAdmin(userId)) {
    return { canDelete: false, reason: LAST_ADMIN };
  }

  return { canDelete: true };
}

export async function performGdprDeletion(
  userId: string,
  options: GdprDeletionOptions,
): Promise<GdprDeletionResult> {
  const user = await getDeletionCandidate(userId);

  if (!user) {
    return failureResult(userId, USER_NOT_FOUND);
  }

  if (user.deletedAt) {
    return failureResult(userId, USER_ALREADY_DELETED, user.deletedAt);
  }

  if (await isLastActiveAdmin(userId)) {
    return failureResult(userId, LAST_ADMIN);
  }

  const originalUserInfo = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };

  const deletedAt = new Date();
  const terminatedSessions = await terminateUserSessions(userId);
  const anonymizedAuditLogs = await anonymizeAuditLogs(userId);
  const flaggedDocuments = await flagDocumentsForReview(userId);
  await removeUserPii(userId);

  await logAuditEvent({
    entityType: 'user',
    entityId: userId,
    action: 'delete',
    before: originalUserInfo,
    metadata: {
      gdprDeletion: true,
      reason: options.reason || DEFAULT_REASON,
      terminatedSessions,
      anonymizedAuditLogs,
      flaggedDocuments,
    },
    performedBy: options.performedBy,
    requestId: options.requestId,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });

  return {
    success: true,
    userId,
    deletedAt,
    anonymizedAuditLogs,
    terminatedSessions,
    flaggedDocuments,
  };
}
