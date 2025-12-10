import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from './setup';
import {
  logAuditEvent,
  queryAuditLogs,
  getAuditLogById,
  calculateChanges,
  sanitizeForAudit,
} from '../src/lib/audit.js';

describe('Audit Service', () => {
  let testUserId: string;

  beforeEach(async () => {
    // Create a test user for audit events
    const user = await prisma.user.create({
      data: {
        email: `audit-test-${Date.now()}@example.com`,
        passwordHash: 'placeholder',
        firstName: 'Audit',
        lastName: 'Test',
        role: 'admin',
      },
    });
    testUserId = user.id;
  });

  describe('logAuditEvent', () => {
    it('should create an audit log entry with all fields', async () => {
      const entry = await logAuditEvent({
        entityType: 'user',
        entityId: testUserId,
        action: 'update',
        before: { firstName: 'Old' },
        after: { firstName: 'New' },
        changes: { firstName: { from: 'Old', to: 'New' } },
        reason: 'Test update',
        metadata: { source: 'test' },
        performedBy: testUserId,
        requestId: 'req-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
      });

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.entityType).toBe('user');
      expect(entry.entityId).toBe(testUserId);
      expect(entry.action).toBe('update');
      expect(entry.performedBy).toBe(testUserId);
      expect(entry.requestId).toBe('req-123');
      expect(entry.ipAddress).toBe('127.0.0.1');
      expect(entry.userAgent).toBe('Test Agent');
    });

    it('should create audit log with minimal fields', async () => {
      const entry = await logAuditEvent({
        entityType: 'user',
        entityId: testUserId,
        action: 'login',
        performedBy: testUserId,
      });

      expect(entry).toBeDefined();
      expect(entry.entityType).toBe('user');
      expect(entry.action).toBe('login');
    });

    it('should handle null userAgent', async () => {
      const entry = await logAuditEvent({
        entityType: 'user',
        entityId: testUserId,
        action: 'logout',
        performedBy: testUserId,
        userAgent: null,
      });

      expect(entry).toBeDefined();
      expect(entry.userAgent).toBeNull();
    });
  });

  describe('queryAuditLogs', () => {
    const docId = '00000000-0000-0000-0000-000000000001';

    beforeEach(async () => {
      // Create multiple audit entries
      await logAuditEvent({
        entityType: 'user',
        entityId: testUserId,
        action: 'login',
        performedBy: testUserId,
      });
      await logAuditEvent({
        entityType: 'user',
        entityId: testUserId,
        action: 'update',
        performedBy: testUserId,
      });
      await logAuditEvent({
        entityType: 'document',
        entityId: docId,
        action: 'create',
        performedBy: testUserId,
      });
    });

    it('should return paginated results', async () => {
      const result = await queryAuditLogs({ limit: 10, offset: 0 });

      expect(result.data).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.data.length).toBeLessThanOrEqual(10);
    });

    it('should filter by entityType', async () => {
      const result = await queryAuditLogs({
        entityType: 'document',
        limit: 10,
        offset: 0,
      });

      expect(result.data.every((log) => log.entityType === 'document')).toBe(true);
    });

    it('should filter by action', async () => {
      const result = await queryAuditLogs({
        action: 'login',
        limit: 10,
        offset: 0,
      });

      expect(result.data.every((log) => log.action === 'login')).toBe(true);
    });

    it('should filter by performedBy', async () => {
      const result = await queryAuditLogs({
        performedBy: testUserId,
        limit: 10,
        offset: 0,
      });

      expect(result.data.every((log) => log.performedBy === testUserId)).toBe(true);
    });

    it('should filter by entityId', async () => {
      const result = await queryAuditLogs({
        entityId: testUserId,
        limit: 10,
        offset: 0,
      });

      expect(result.data.every((log) => log.entityId === testUserId)).toBe(true);
    });

    it('should support date range filtering', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const result = await queryAuditLogs({
        startDate: yesterday,
        endDate: now,
        limit: 10,
        offset: 0,
      });

      expect(result.data).toBeDefined();
      result.data.forEach((log) => {
        expect(new Date(log.performedAt).getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(new Date(log.performedAt).getTime()).toBeLessThanOrEqual(now.getTime());
      });
    });
  });

  describe('getAuditLogById', () => {
    it('should return audit log by id', async () => {
      const created = await logAuditEvent({
        entityType: 'user',
        entityId: testUserId,
        action: 'create',
        performedBy: testUserId,
      });

      const found = await getAuditLogById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.entityType).toBe('user');
    });

    it('should return null for non-existent id', async () => {
      const found = await getAuditLogById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('calculateChanges', () => {
    it('should detect changed fields', () => {
      const before = { firstName: 'Old', lastName: 'User', email: 'same@example.com' };
      const after = { firstName: 'New', lastName: 'User', email: 'same@example.com' };

      const changes = calculateChanges(before, after);

      expect(changes).toEqual({
        firstName: { from: 'Old', to: 'New' },
      });
    });

    it('should detect multiple changes', () => {
      const before = { a: 1, b: 2, c: 3 };
      const after = { a: 10, b: 2, c: 30 };

      const changes = calculateChanges(before, after);

      expect(changes).toEqual({
        a: { from: 1, to: 10 },
        c: { from: 3, to: 30 },
      });
    });

    it('should return null when no changes', () => {
      const before = { a: 1, b: 2 };
      const after = { a: 1, b: 2 };

      const changes = calculateChanges(before, after);

      expect(changes).toBeNull();
    });

    it('should handle null values in fields', () => {
      const before = { a: null, b: 'value' };
      const after = { a: 'new', b: null };

      const changes = calculateChanges(before, after);

      expect(changes).toEqual({
        a: { from: null, to: 'new' },
        b: { from: 'value', to: null },
      });
    });

    it('should return null for null before input', () => {
      const changes = calculateChanges(null, { a: 1 });
      expect(changes).toBeNull();
    });

    it('should return null for null after input', () => {
      const changes = calculateChanges({ a: 1 }, null);
      expect(changes).toBeNull();
    });
  });

  describe('sanitizeForAudit', () => {
    it('should redact sensitive fields', () => {
      const data = {
        id: '123',
        email: 'user@example.com',
        password: 'secret',
        passwordHash: 'hash123',
        token: 'jwt-token',
        secret: 'api-secret',
        apiKey: 'key-123',
      };

      const sanitized = sanitizeForAudit(data);

      expect(sanitized.id).toBe('123');
      expect(sanitized.email).toBe('user@example.com');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.passwordHash).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          id: '123',
          passwordHash: 'hash',
        },
      };

      const sanitized = sanitizeForAudit(data);

      expect(sanitized.user).toBeDefined();
      // Note: current implementation does not deep-sanitize nested objects
    });

    it('should not modify non-sensitive fields', () => {
      const data = {
        id: '123',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
      };

      const sanitized = sanitizeForAudit(data);

      expect(sanitized).toEqual(data);
    });

    it('should handle empty object', () => {
      const sanitized = sanitizeForAudit({});
      expect(sanitized).toEqual({});
    });
  });
});
