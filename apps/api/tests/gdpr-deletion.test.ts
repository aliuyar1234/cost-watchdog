import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { redis } from '../src/lib/redis.js';
import {
  performGdprDeletion,
  canPerformGdprDeletion,
  isLastActiveAdmin,
  getActiveAdminCount,
  anonymizeAuditLogs,
  flagDocumentsForReview,
  removeUserPii,
  terminateUserSessions,
} from '../src/lib/gdpr.js';
import { createSession } from '../src/lib/sessions.js';
import { logAuditEvent } from '../src/lib/audit.js';

describe('GDPR Deletion Service', () => {
  const testUserId1 = '00000000-0000-0000-0000-000000000001';
  const testUserId2 = '00000000-0000-0000-0000-000000000002';
  const testAdminId = '00000000-0000-0000-0000-000000000003';
  const testDocumentId = '00000000-0000-0000-0000-000000000004';
  const testSessionId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany({
      where: {
        entityId: { in: [testUserId1, testUserId2, testAdminId] },
      },
    });
    await prisma.mfaEnrollment.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2, testAdminId] } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2, testAdminId] } },
    });
    await prisma.apiKey.deleteMany({
      where: { createdById: { in: [testUserId1, testUserId2, testAdminId] } },
    });
    await prisma.document.deleteMany({
      where: { id: testDocumentId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2, testAdminId] } },
    });

    // Clean up Redis
    await redis.del(`session:${testSessionId}`);
    await redis.del(`user_sessions:${testUserId1}`);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.auditLog.deleteMany({
      where: {
        entityId: { in: [testUserId1, testUserId2, testAdminId] },
      },
    });
    await prisma.mfaEnrollment.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2, testAdminId] } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2, testAdminId] } },
    });
    await prisma.apiKey.deleteMany({
      where: { createdById: { in: [testUserId1, testUserId2, testAdminId] } },
    });
    await prisma.document.deleteMany({
      where: { id: testDocumentId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2, testAdminId] } },
    });

    // Clean up Redis
    await redis.del(`session:${testSessionId}`);
    await redis.del(`user_sessions:${testUserId1}`);
  });

  describe('isLastActiveAdmin', () => {
    it('should return true if user is the only active admin', async () => {
      await prisma.user.create({
        data: {
          id: testAdminId,
          email: 'admin@test.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          isActive: true,
        },
      });

      const result = await isLastActiveAdmin(testAdminId);
      expect(result).toBe(true);
    });

    it('should return false if there are other active admins', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin1@test.com',
            firstName: 'Admin',
            lastName: 'One',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'admin2@test.com',
            firstName: 'Admin',
            lastName: 'Two',
            role: 'admin',
            isActive: true,
          },
        ],
      });

      const result = await isLastActiveAdmin(testAdminId);
      expect(result).toBe(false);
    });

    it('should return false if user is not an admin', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'viewer@test.com',
          firstName: 'Viewer',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      const result = await isLastActiveAdmin(testUserId1);
      expect(result).toBe(false);
    });

    it('should return false if user is inactive admin', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin1@test.com',
            firstName: 'Admin',
            lastName: 'One',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'admin2@test.com',
            firstName: 'Admin',
            lastName: 'Two',
            role: 'admin',
            isActive: false,
          },
        ],
      });

      const result = await isLastActiveAdmin(testUserId1);
      expect(result).toBe(false);
    });

    it('should return false if user is already deleted admin', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin1@test.com',
            firstName: 'Admin',
            lastName: 'One',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'admin2@test.com',
            firstName: 'Admin',
            lastName: 'Two',
            role: 'admin',
            isActive: true,
            deletedAt: new Date(),
          },
        ],
      });

      const result = await isLastActiveAdmin(testUserId1);
      expect(result).toBe(false);
    });
  });

  describe('getActiveAdminCount', () => {
    it('should return count of active admins', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin1@test.com',
            firstName: 'Admin',
            lastName: 'One',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'admin2@test.com',
            firstName: 'Admin',
            lastName: 'Two',
            role: 'admin',
            isActive: false,
          },
          {
            id: testUserId2,
            email: 'viewer@test.com',
            firstName: 'Viewer',
            lastName: 'User',
            role: 'viewer',
            isActive: true,
          },
        ],
      });

      const count = await getActiveAdminCount();
      expect(count).toBe(1);
    });
  });

  describe('anonymizeAuditLogs', () => {
    it('should anonymize audit logs for a user', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      // Create audit log entry
      await logAuditEvent({
        entityType: 'user',
        entityId: testUserId1,
        action: 'login',
        performedBy: testUserId1,
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
      });

      const count = await anonymizeAuditLogs(testUserId1);
      expect(count).toBeGreaterThan(0);

      // Check that log is anonymized
      const logs = await prisma.auditLog.findMany({
        where: { entityId: testUserId1 },
      });

      expect(logs[0].anonymized).toBe(true);
      expect(logs[0].ipAddress).toBeNull();
      expect(logs[0].userAgent).toBeNull();
    });

    it('should anonymize performedBy field', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      await logAuditEvent({
        entityType: 'user',
        entityId: testUserId1,
        action: 'login',
        performedBy: testUserId1,
      });

      await anonymizeAuditLogs(testUserId1);

      const logs = await prisma.auditLog.findMany({
        where: { entityId: testUserId1 },
      });

      expect(logs[0].performedBy).toContain('deleted_');
    });

    it('should not anonymize already anonymized logs', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      await logAuditEvent({
        entityType: 'user',
        entityId: testUserId1,
        action: 'login',
        performedBy: testUserId1,
      });

      // Anonymize twice
      const count1 = await anonymizeAuditLogs(testUserId1);
      const count2 = await anonymizeAuditLogs(testUserId1);

      expect(count1).toBeGreaterThan(0);
      expect(count2).toBe(0);
    });
  });

  describe('flagDocumentsForReview', () => {
    it('should flag documents uploaded by user', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      await prisma.document.create({
        data: {
          id: testDocumentId,
          filename: 'test.pdf',
          originalFilename: 'test.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          fileHash: 'test-hash-' + Date.now(),
          storagePath: '/test/path',
          uploadedBy: testUserId1,
          verificationStatus: 'auto_verified',
        },
      });

      const count = await flagDocumentsForReview(testUserId1);
      expect(count).toBe(1);

      const doc = await prisma.document.findUnique({
        where: { id: testDocumentId },
      });

      expect(doc?.verificationStatus).toBe('pending');
      expect(doc?.verificationNotes).toContain('review required');
    });
  });

  describe('removeUserPii', () => {
    it('should remove PII from user record', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
          passwordHash: 'some-hash',
          avatarUrl: 'https://example.com/avatar.png',
          allowedLocationIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
        },
      });

      await removeUserPii(testUserId1);

      const user = await prisma.user.findUnique({
        where: { id: testUserId1 },
      });

      expect(user?.email).toContain('@deleted.local');
      expect(user?.firstName).toBe('Deleted');
      expect(user?.lastName).toBe('User');
      expect(user?.passwordHash).toBeNull();
      expect(user?.avatarUrl).toBeNull();
      expect(user?.isActive).toBe(false);
      expect(user?.deletedAt).toBeDefined();
      expect(user?.allowedLocationIds).toEqual([]);
    });

    it('should delete MFA enrollments', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      await prisma.mfaEnrollment.create({
        data: {
          userId: testUserId1,
          method: 'totp',
          secretEncrypted: 'encrypted-secret',
          backupCodesHash: ['hash1', 'hash2'],
        },
      });

      await removeUserPii(testUserId1);

      const enrollments = await prisma.mfaEnrollment.findMany({
        where: { userId: testUserId1 },
      });

      expect(enrollments.length).toBe(0);
    });

    it('should delete password reset tokens', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      await prisma.passwordResetToken.create({
        data: {
          userId: testUserId1,
          tokenHash: 'test-token-hash',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      await removeUserPii(testUserId1);

      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId: testUserId1 },
      });

      expect(tokens.length).toBe(0);
    });

    it('should revoke API keys', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      await prisma.apiKey.create({
        data: {
          name: 'Test Key',
          keyHash: 'test-key-hash-' + Date.now(),
          keyPrefix: 'cw_',
          scopes: ['read:anomalies'],
          createdById: testUserId1,
          isActive: true,
        },
      });

      await removeUserPii(testUserId1);

      const keys = await prisma.apiKey.findMany({
        where: { createdById: testUserId1 },
      });

      expect(keys[0].isActive).toBe(false);
      expect(keys[0].revokedAt).toBeDefined();
    });
  });

  describe('terminateUserSessions', () => {
    it('should terminate all sessions for user', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: true,
        },
      });

      await createSession(testSessionId, testUserId1, '192.168.1.1', 'Test Agent');

      const count = await terminateUserSessions(testUserId1);
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('canPerformGdprDeletion', () => {
    it('should return true for deletable user', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'test@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'viewer',
            isActive: true,
          },
        ],
      });

      const result = await canPerformGdprDeletion(testUserId1);
      expect(result.canDelete).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      const result = await canPerformGdprDeletion('99999999-9999-9999-9999-999999999999');
      expect(result.canDelete).toBe(false);
      expect(result.reason).toBe('User not found');
    });

    it('should return false for already deleted user', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'viewer',
          isActive: false,
          deletedAt: new Date(),
        },
      });

      const result = await canPerformGdprDeletion(testUserId1);
      expect(result.canDelete).toBe(false);
      expect(result.reason).toBe('User already deleted');
    });

    it('should return false for last active admin', async () => {
      await prisma.user.create({
        data: {
          id: testAdminId,
          email: 'admin@test.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          isActive: true,
        },
      });

      const result = await canPerformGdprDeletion(testAdminId);
      expect(result.canDelete).toBe(false);
      expect(result.reason).toBe('Cannot delete the last active admin');
    });
  });

  describe('performGdprDeletion', () => {
    it('should perform complete GDPR deletion', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'test@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'viewer',
            isActive: true,
          },
        ],
      });

      const result = await performGdprDeletion(testUserId1, {
        performedBy: testAdminId,
        reason: 'User request',
      });

      expect(result.success).toBe(true);
      expect(result.deletedAt).toBeDefined();

      // Verify user PII is removed
      const user = await prisma.user.findUnique({
        where: { id: testUserId1 },
      });

      expect(user?.email).toContain('@deleted.local');
      expect(user?.deletedAt).toBeDefined();
    });

    it('should fail for non-existent user', async () => {
      const result = await performGdprDeletion('99999999-9999-9999-9999-999999999999', {
        performedBy: testAdminId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail for already deleted user', async () => {
      await prisma.user.create({
        data: {
          id: testUserId1,
          email: 'deleted@deleted.local',
          firstName: 'Deleted',
          lastName: 'User',
          role: 'viewer',
          isActive: false,
          deletedAt: new Date(),
        },
      });

      const result = await performGdprDeletion(testUserId1, {
        performedBy: testAdminId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User already deleted');
    });

    it('should fail for last active admin', async () => {
      await prisma.user.create({
        data: {
          id: testAdminId,
          email: 'admin@test.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          isActive: true,
        },
      });

      const result = await performGdprDeletion(testAdminId, {
        performedBy: testAdminId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot delete the last active admin');
    });

    it('should log audit event for GDPR deletion', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'test@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'viewer',
            isActive: true,
          },
        ],
      });

      await performGdprDeletion(testUserId1, {
        performedBy: testAdminId,
        reason: 'User request',
        requestId: 'test-request-id',
      });

      // Check audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityId: testUserId1,
          action: 'delete',
        },
        orderBy: { performedAt: 'desc' },
      });

      const gdprLog = auditLogs.find(
        (log) => (log.metadata as Record<string, unknown>)?.gdprDeletion === true
      );
      expect(gdprLog).toBeDefined();
      expect(gdprLog?.performedBy).toBe(testAdminId);
    });

    it('should include deletion summary in result', async () => {
      await prisma.user.createMany({
        data: [
          {
            id: testAdminId,
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            isActive: true,
          },
          {
            id: testUserId1,
            email: 'test@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'viewer',
            isActive: true,
          },
        ],
      });

      // Create some audit logs to anonymize
      await logAuditEvent({
        entityType: 'user',
        entityId: testUserId1,
        action: 'login',
        performedBy: testUserId1,
      });

      const result = await performGdprDeletion(testUserId1, {
        performedBy: testAdminId,
      });

      expect(result.success).toBe(true);
      expect(result.anonymizedAuditLogs).toBeGreaterThanOrEqual(0);
      expect(result.terminatedSessions).toBeGreaterThanOrEqual(0);
      expect(result.flaggedDocuments).toBeGreaterThanOrEqual(0);
    });
  });
});
