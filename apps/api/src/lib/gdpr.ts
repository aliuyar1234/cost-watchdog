/**
 * GDPR Compliance Library
 *
 * Handles GDPR-compliant user deletion including:
 * - PII removal from user records
 * - Audit log anonymization
 * - Session termination
 * - Document flagging for review
 * - Last admin protection
 */

import { prisma } from './db.js';
import { terminateAllSessions } from './sessions.js';
import { invalidateAllFamiliesForUser } from './token-rotation.js';
import { logAuditEvent, AuditAction, AuditEntityType } from './audit.js';
import { createHash, randomBytes } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GdprDeletionResult {
  success: boolean;
  userId: string;
  deletedAt: Date;
  anonymizedAuditLogs: number;
  terminatedSessions: number;
  flaggedDocuments: number;
  error?: string;
}

export interface GdprDeletionOptions {
  /** User ID performing the deletion (admin) */
  performedBy: string;
  /** Reason for deletion (user request, legal requirement, etc.) */
  reason?: string;
  /** Request ID for audit trail */
  requestId?: string;
  /** IP address for audit trail */
  ipAddress?: string;
  /** User agent for audit trail */
  userAgent?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ANONYMOUS_EMAIL_DOMAIN = 'deleted.local';
const ANONYMOUS_FIRST_NAME = 'Deleted';
const ANONYMOUS_LAST_NAME = 'User';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate an anonymous identifier for a deleted user.
 * Uses a hash to create a consistent but non-reversible identifier.
 */
function generateAnonymousId(userId: string): string {
  const hash = createHash('sha256').update(userId).digest('hex').substring(0, 12);
  return `deleted_${hash}`;
}

/**
 * Generate an anonymous email for a deleted user.
 */
function generateAnonymousEmail(userId: string): string {
  const anonymousId = generateAnonymousId(userId);
  return `${anonymousId}@${ANONYMOUS_EMAIL_DOMAIN}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if this is the last active admin in the system.
 * Prevents deletion if this would leave the system without an admin.
 */
export async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const activeAdminCount = await prisma.user.count({
    where: {
      role: 'admin',
      isActive: true,
      deletedAt: null,
    },
  });

  // Check if the user being deleted is an admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, deletedAt: true },
  });

  if (!user || user.role !== 'admin' || !user.isActive || user.deletedAt) {
    // User is not an active admin, so this check doesn't apply
    return false;
  }

  // If there's only 1 active admin and it's this user, they're the last
  return activeAdminCount === 1;
}

/**
 * Get count of active admins in the system.
 */
export async function getActiveAdminCount(): Promise<number> {
  return prisma.user.count({
    where: {
      role: 'admin',
      isActive: true,
      deletedAt: null,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG ANONYMIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anonymize audit logs for a deleted user.
 * Replaces PII in audit log entries while preserving the audit trail structure.
 */
export async function anonymizeAuditLogs(userId: string): Promise<number> {
  const anonymousId = generateAnonymousId(userId);

  // Find all audit logs where this user is the performer or the subject
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { performedBy: userId },
        { entityType: 'user', entityId: userId },
      ],
      anonymized: false,
    },
  });

  let anonymizedCount = 0;

  for (const log of auditLogs) {
    const updates: Record<string, unknown> = {
      anonymized: true,
    };

    // Anonymize performedBy if it's this user
    if (log.performedBy === userId) {
      updates['performedBy'] = anonymousId;
    }

    // Anonymize before/after data if it contains PII
    if (log.before) {
      updates['before'] = anonymizeJsonField(log.before as Record<string, unknown>, userId);
    }
    if (log.after) {
      updates['after'] = anonymizeJsonField(log.after as Record<string, unknown>, userId);
    }

    // Remove IP address and user agent (considered PII under GDPR)
    updates['ipAddress'] = null;
    updates['userAgent'] = null;

    await prisma.auditLog.update({
      where: { id: log.id },
      data: updates,
    });

    anonymizedCount++;
  }

  return anonymizedCount;
}

/**
 * Anonymize PII fields in a JSON object.
 */
function anonymizeJsonField(
  data: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const piiFields = ['email', 'firstName', 'lastName', 'avatarUrl', 'ssoSubject'];
  const result = { ...data };

  for (const field of piiFields) {
    if (field in result) {
      result[field] = '[ANONYMIZED]';
    }
  }

  // Replace user ID references
  if (result['id'] === userId) {
    result['id'] = generateAnonymousId(userId);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT FLAGGING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flag documents uploaded by a user for review.
 * Marks them for review but doesn't delete them (business data retention).
 */
export async function flagDocumentsForReview(userId: string): Promise<number> {
  const result = await prisma.document.updateMany({
    where: {
      uploadedBy: userId,
    },
    data: {
      verificationStatus: 'pending',
      verificationNotes: 'Uploader account deleted - review required',
    },
  });

  return result.count;
}

// ═══════════════════════════════════════════════════════════════════════════
// PII REMOVAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remove PII from a user record.
 * Replaces identifiable information with anonymous placeholders.
 */
export async function removeUserPii(userId: string): Promise<void> {
  const anonymousEmail = generateAnonymousEmail(userId);

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: anonymousEmail,
      firstName: ANONYMOUS_FIRST_NAME,
      lastName: ANONYMOUS_LAST_NAME,
      passwordHash: null,
      ssoSubject: null,
      avatarUrl: null,
      permissions: [],
      allowedLocationIds: [],
      allowedCostCenterIds: [],
      isActive: false,
      deletedAt: new Date(),
    },
  });

  // Delete MFA enrollments (contains encrypted secrets)
  await prisma.mfaEnrollment.deleteMany({
    where: { userId },
  });

  // Delete password reset tokens
  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  });

  // Delete API keys created by this user
  await prisma.apiKey.updateMany({
    where: { createdById: userId },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION TERMINATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Terminate all active sessions and invalidate all token families for a user.
 */
export async function terminateUserSessions(userId: string): Promise<number> {
  // Terminate all sessions in Redis
  const terminatedSessions = await terminateAllSessions(userId);

  // Invalidate all token families
  await invalidateAllFamiliesForUser(userId, 'gdpr_deletion');

  return terminatedSessions;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GDPR DELETION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perform a complete GDPR-compliant deletion of a user.
 *
 * This function:
 * 1. Checks if the user is the last admin (prevents deletion)
 * 2. Terminates all active sessions
 * 3. Anonymizes audit logs
 * 4. Flags uploaded documents for review
 * 5. Removes PII from the user record
 * 6. Logs the deletion event
 */
export async function performGdprDeletion(
  userId: string,
  options: GdprDeletionOptions
): Promise<GdprDeletionResult> {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!user) {
    return {
      success: false,
      userId,
      deletedAt: new Date(),
      anonymizedAuditLogs: 0,
      terminatedSessions: 0,
      flaggedDocuments: 0,
      error: 'User not found',
    };
  }

  // Check if already deleted
  if (user.deletedAt) {
    return {
      success: false,
      userId,
      deletedAt: user.deletedAt,
      anonymizedAuditLogs: 0,
      terminatedSessions: 0,
      flaggedDocuments: 0,
      error: 'User already deleted',
    };
  }

  // Check last admin protection
  if (await isLastActiveAdmin(userId)) {
    return {
      success: false,
      userId,
      deletedAt: new Date(),
      anonymizedAuditLogs: 0,
      terminatedSessions: 0,
      flaggedDocuments: 0,
      error: 'Cannot delete the last active admin',
    };
  }

  // Store original user info for audit log (before anonymization)
  const originalUserInfo = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };

  const deletedAt = new Date();

  // Step 1: Terminate sessions
  const terminatedSessions = await terminateUserSessions(userId);

  // Step 2: Anonymize audit logs
  const anonymizedAuditLogs = await anonymizeAuditLogs(userId);

  // Step 3: Flag documents for review
  const flaggedDocuments = await flagDocumentsForReview(userId);

  // Step 4: Remove PII from user record
  await removeUserPii(userId);

  // Step 5: Log the deletion event
  await logAuditEvent({
    entityType: 'user' as AuditEntityType,
    entityId: userId,
    action: 'delete' as AuditAction,
    before: originalUserInfo,
    metadata: {
      gdprDeletion: true,
      reason: options.reason || 'User requested deletion',
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

/**
 * Check if a user can be GDPR deleted.
 * Returns validation result without performing deletion.
 */
export async function canPerformGdprDeletion(userId: string): Promise<{
  canDelete: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true, role: true, isActive: true },
  });

  if (!user) {
    return { canDelete: false, reason: 'User not found' };
  }

  if (user.deletedAt) {
    return { canDelete: false, reason: 'User already deleted' };
  }

  if (await isLastActiveAdmin(userId)) {
    return { canDelete: false, reason: 'Cannot delete the last active admin' };
  }

  return { canDelete: true };
}
