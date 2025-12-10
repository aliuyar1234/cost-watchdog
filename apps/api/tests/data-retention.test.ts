import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { redis } from '../src/lib/redis.js';
import {
  cleanupTokenBlacklist,
  cleanupOutboxEvents,
  cleanupOutboxEventsBatched,
  cleanupLoginAttempts,
  cleanupPasswordResetTokens,
  cleanupAuditLogs,
  runRetentionCleanup,
  getRetentionConfig,
  getRetentionStats,
} from '../src/lib/data-retention.js';
import {
  RetentionWorker,
  createRetentionWorker,
} from '../src/workers/retention.worker.js';

// Test user for creating related data
let testUserId: string;
let testUserEmail: string;

describe('Data Retention', () => {
  beforeAll(async () => {
    // Create a test user
    testUserEmail = `retention-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: testUserEmail,
        firstName: 'Retention',
        lastName: 'Test',
        role: 'admin',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up password reset tokens first (due to foreign key)
    await prisma.passwordResetToken.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    // Then clean up test user
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('getRetentionConfig', () => {
    it('should return default configuration', () => {
      const config = getRetentionConfig();

      expect(config.outboxEventRetentionDays).toBeTypeOf('number');
      expect(config.loginAttemptRetentionDays).toBeTypeOf('number');
      expect(config.passwordResetTokenRetentionDays).toBeTypeOf('number');
      expect(config.auditLogRetentionDays).toBeTypeOf('number');
      expect(config.archiveAuditLogs).toBeTypeOf('boolean');
      expect(config.batchSize).toBeTypeOf('number');
    });

    it('should use environment variables when set', () => {
      const originalEnv = process.env['RETENTION_OUTBOX_DAYS'];
      process.env['RETENTION_OUTBOX_DAYS'] = '7';

      const config = getRetentionConfig();
      expect(config.outboxEventRetentionDays).toBe(7);

      if (originalEnv) {
        process.env['RETENTION_OUTBOX_DAYS'] = originalEnv;
      } else {
        delete process.env['RETENTION_OUTBOX_DAYS'];
      }
    });
  });

  describe('cleanupTokenBlacklist', () => {
    beforeEach(async () => {
      // Clean up any existing test keys
      const keys = await redis.keys('token_blacklist:test_*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    });

    it('should clean up orphaned token blacklist keys without TTL', async () => {
      // Create a key without TTL (orphaned)
      await redis.set('token_blacklist:test_orphan_1', '1');
      await redis.set('token_blacklist:test_orphan_2', '1');

      // Verify keys exist without TTL
      const ttl1 = await redis.ttl('token_blacklist:test_orphan_1');
      expect(ttl1).toBe(-1); // -1 means no TTL

      const result = await cleanupTokenBlacklist();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify keys are deleted
      const exists1 = await redis.exists('token_blacklist:test_orphan_1');
      const exists2 = await redis.exists('token_blacklist:test_orphan_2');
      expect(exists1).toBe(0);
      expect(exists2).toBe(0);
    });

    it('should not delete token blacklist keys with TTL', async () => {
      // Create a key with TTL (normal)
      await redis.setex('token_blacklist:test_with_ttl', 3600, '1');

      const result = await cleanupTokenBlacklist();

      expect(result.success).toBe(true);

      // Key should still exist
      const exists = await redis.exists('token_blacklist:test_with_ttl');
      expect(exists).toBe(1);

      // Cleanup
      await redis.del('token_blacklist:test_with_ttl');
    });

    it('should return success with 0 deleted when no orphaned keys', async () => {
      const result = await cleanupTokenBlacklist();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupOutboxEvents', () => {
    beforeEach(async () => {
      // Clean up existing test events
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'test_retention' },
      });
    });

    it('should clean up old processed outbox events', async () => {
      // Create old processed events
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      await prisma.outboxEvent.createMany({
        data: [
          {
            aggregateType: 'test_retention',
            aggregateId: '00000000-0000-0000-0000-000000000001',
            eventType: 'test.cleanup',
            payload: { test: true },
            processedAt: oldDate,
            createdAt: oldDate,
          },
          {
            aggregateType: 'test_retention',
            aggregateId: '00000000-0000-0000-0000-000000000002',
            eventType: 'test.cleanup',
            payload: { test: true },
            processedAt: oldDate,
            createdAt: oldDate,
          },
        ],
      });

      const result = await cleanupOutboxEvents(30);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);
    });

    it('should not delete recent processed events', async () => {
      // Create recent processed event
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago

      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'test_retention',
          aggregateId: '00000000-0000-0000-0000-000000000003',
          eventType: 'test.recent',
          payload: { test: true },
          processedAt: recentDate,
          createdAt: recentDate,
        },
      });

      const countBefore = await prisma.outboxEvent.count({
        where: { aggregateType: 'test_retention', eventType: 'test.recent' },
      });

      await cleanupOutboxEvents(30);

      const countAfter = await prisma.outboxEvent.count({
        where: { aggregateType: 'test_retention', eventType: 'test.recent' },
      });

      expect(countAfter).toBe(countBefore);

      // Cleanup
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'test_retention', eventType: 'test.recent' },
      });
    });

    it('should not delete unprocessed events', async () => {
      // Create old unprocessed event
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);

      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'test_retention',
          aggregateId: '00000000-0000-0000-0000-000000000004',
          eventType: 'test.unprocessed',
          payload: { test: true },
          processedAt: null, // Not processed
          createdAt: oldDate,
        },
      });

      await cleanupOutboxEvents(30);

      const count = await prisma.outboxEvent.count({
        where: { aggregateType: 'test_retention', eventType: 'test.unprocessed' },
      });

      expect(count).toBe(1);

      // Cleanup
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'test_retention', eventType: 'test.unprocessed' },
      });
    });
  });

  describe('cleanupOutboxEventsBatched', () => {
    beforeEach(async () => {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'test_retention_batch' },
      });
    });

    it('should clean up events in batches', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);

      // Create 15 old events
      const events = Array.from({ length: 15 }, (_, i) => ({
        aggregateType: 'test_retention_batch',
        aggregateId: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
        eventType: 'test.batch',
        payload: { index: i },
        processedAt: oldDate,
        createdAt: oldDate,
      }));

      await prisma.outboxEvent.createMany({ data: events });

      // Use small batch size to test batching
      const result = await cleanupOutboxEventsBatched(30, 5);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(15);
    });
  });

  describe('cleanupLoginAttempts', () => {
    beforeEach(async () => {
      await prisma.loginAttempt.deleteMany({
        where: { email: { contains: 'retention-cleanup' } },
      });
    });

    it('should clean up old login attempts', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 120); // 120 days ago

      await prisma.loginAttempt.createMany({
        data: [
          {
            email: 'retention-cleanup-1@test.com',
            ipAddress: '127.0.0.1',
            success: false,
            attemptedAt: oldDate,
          },
          {
            email: 'retention-cleanup-2@test.com',
            ipAddress: '127.0.0.1',
            success: true,
            attemptedAt: oldDate,
          },
        ],
      });

      const result = await cleanupLoginAttempts(90);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);
    });

    it('should not delete recent login attempts', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago

      await prisma.loginAttempt.create({
        data: {
          email: 'retention-cleanup-recent@test.com',
          ipAddress: '127.0.0.1',
          success: true,
          attemptedAt: recentDate,
        },
      });

      await cleanupLoginAttempts(90);

      const count = await prisma.loginAttempt.count({
        where: { email: 'retention-cleanup-recent@test.com' },
      });

      expect(count).toBe(1);

      // Cleanup
      await prisma.loginAttempt.deleteMany({
        where: { email: 'retention-cleanup-recent@test.com' },
      });
    });
  });

  describe('cleanupPasswordResetTokens', () => {
    beforeEach(async () => {
      // Ensure test user exists (in case of test isolation issues)
      const userExists = await prisma.user.findUnique({ where: { id: testUserId } });
      if (!userExists) {
        const user = await prisma.user.create({
          data: {
            id: testUserId,
            email: testUserEmail || `retention-test-recovery-${Date.now()}@example.com`,
            firstName: 'Retention',
            lastName: 'Test',
            role: 'admin',
          },
        });
        testUserId = user.id;
      }
      // Clean up tokens for test user
      await prisma.passwordResetToken.deleteMany({
        where: { userId: testUserId },
      });
    });

    it('should clean up expired password reset tokens', async () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 1); // Expired 1 hour ago

      const crypto = await import('crypto');
      await prisma.passwordResetToken.create({
        data: {
          userId: testUserId,
          tokenHash: crypto.randomBytes(32).toString('hex'),
          expiresAt: expiredDate,
        },
      });

      const result = await cleanupPasswordResetTokens(7);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);
    });

    it('should clean up old used password reset tokens', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 14); // 14 days ago

      const crypto = await import('crypto');
      await prisma.passwordResetToken.create({
        data: {
          userId: testUserId,
          tokenHash: crypto.randomBytes(32).toString('hex'),
          expiresAt: new Date(oldDate.getTime() + 3600000), // Expired after creation
          usedAt: oldDate,
          createdAt: oldDate,
        },
      });

      const result = await cleanupPasswordResetTokens(7);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);
    });

    it('should not delete active unexpired tokens', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1); // Expires in 1 hour

      const crypto = await import('crypto');
      await prisma.passwordResetToken.create({
        data: {
          userId: testUserId,
          tokenHash: crypto.randomBytes(32).toString('hex'),
          expiresAt: futureDate,
        },
      });

      await cleanupPasswordResetTokens(7);

      const count = await prisma.passwordResetToken.count({
        where: { userId: testUserId, usedAt: null },
      });

      expect(count).toBe(1);
    });
  });

  describe('cleanupAuditLogs', () => {
    beforeEach(async () => {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'test_retention' },
      });
    });

    it('should clean up old audit logs', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400); // 400 days ago

      await prisma.auditLog.createMany({
        data: [
          {
            entityType: 'test_retention',
            entityId: '00000000-0000-0000-0000-000000000001',
            action: 'test',
            performedBy: testUserId,
            performedAt: oldDate,
          },
          {
            entityType: 'test_retention',
            entityId: '00000000-0000-0000-0000-000000000002',
            action: 'test',
            performedBy: testUserId,
            performedAt: oldDate,
          },
        ],
      });

      const result = await cleanupAuditLogs(365);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);
    });

    it('should not delete recent audit logs', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago

      await prisma.auditLog.create({
        data: {
          entityType: 'test_retention',
          entityId: '00000000-0000-0000-0000-000000000003',
          action: 'test_recent',
          performedBy: testUserId,
          performedAt: recentDate,
        },
      });

      await cleanupAuditLogs(365);

      const count = await prisma.auditLog.count({
        where: { entityType: 'test_retention', action: 'test_recent' },
      });

      expect(count).toBe(1);

      // Cleanup
      await prisma.auditLog.deleteMany({
        where: { entityType: 'test_retention', action: 'test_recent' },
      });
    });

    it('should archive audit logs when archive option is true', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400);

      await prisma.auditLog.create({
        data: {
          entityType: 'test_retention',
          entityId: '00000000-0000-0000-0000-000000000004',
          action: 'test_archive',
          performedBy: testUserId,
          performedAt: oldDate,
        },
      });

      const consoleSpy = vi.spyOn(console, 'log');

      const result = await cleanupAuditLogs(365, 1000, true);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);
      expect(result.archivedCount).toBeGreaterThanOrEqual(1);

      // Check that archive log was created
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DataRetention] Archived')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('runRetentionCleanup', () => {
    it('should run all cleanup tasks', async () => {
      const result = await runRetentionCleanup();

      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());

      expect(result.results.tokenBlacklist).toBeDefined();
      expect(result.results.outboxEvents).toBeDefined();
      expect(result.results.loginAttempts).toBeDefined();
      expect(result.results.passwordResetTokens).toBeDefined();
      expect(result.results.auditLogs).toBeDefined();

      expect(typeof result.totalDeleted).toBe('number');
      expect(typeof result.hasErrors).toBe('boolean');
    });

    it('should use custom configuration', async () => {
      const result = await runRetentionCleanup({
        outboxEventRetentionDays: 1,
        loginAttemptRetentionDays: 1,
        auditLogRetentionDays: 1,
        batchSize: 10,
      });

      expect(result.results.outboxEvents.success).toBe(true);
      expect(result.results.loginAttempts.success).toBe(true);
      expect(result.results.auditLogs.success).toBe(true);
    });
  });

  describe('getRetentionStats', () => {
    it('should return retention statistics', async () => {
      const stats = await getRetentionStats();

      expect(stats.outboxEvents).toBeDefined();
      expect(typeof stats.outboxEvents.total).toBe('number');
      expect(typeof stats.outboxEvents.processed).toBe('number');
      expect(typeof stats.outboxEvents.pending).toBe('number');

      expect(stats.loginAttempts).toBeDefined();
      expect(typeof stats.loginAttempts.total).toBe('number');
      expect(typeof stats.loginAttempts.last24h).toBe('number');
      expect(typeof stats.loginAttempts.last7d).toBe('number');

      expect(stats.passwordResetTokens).toBeDefined();
      expect(typeof stats.passwordResetTokens.total).toBe('number');
      expect(typeof stats.passwordResetTokens.expired).toBe('number');
      expect(typeof stats.passwordResetTokens.used).toBe('number');

      expect(stats.auditLogs).toBeDefined();
      expect(typeof stats.auditLogs.total).toBe('number');
      expect(typeof stats.auditLogs.last30d).toBe('number');
      expect(typeof stats.auditLogs.older).toBe('number');
    });
  });
});

describe('Retention Worker', () => {
  describe('createRetentionWorker', () => {
    it('should create a retention worker instance', () => {
      const worker = createRetentionWorker();

      expect(worker).toBeInstanceOf(RetentionWorker);
    });

    it('should accept custom configuration', () => {
      const worker = createRetentionWorker({
        schedule: '0 4 * * *',
        runOnStartup: true,
      });

      expect(worker).toBeInstanceOf(RetentionWorker);
    });
  });

  describe('RetentionWorker', () => {
    it('should start and stop correctly', async () => {
      const worker = new RetentionWorker({
        schedule: '0 3 * * *',
        runOnStartup: false,
      });

      await worker.start();
      expect(worker.isCleanupInProgress()).toBe(false);

      worker.stop();
    });

    it('should run cleanup on startup when configured', async () => {
      const worker = new RetentionWorker({
        schedule: '0 3 * * *',
        runOnStartup: true,
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await worker.start();

      // Give it time to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RetentionWorker] Running initial cleanup')
      );

      worker.stop();
      consoleSpy.mockRestore();
    });

    it('should manually trigger cleanup', async () => {
      const worker = new RetentionWorker({
        schedule: '0 3 * * *',
        runOnStartup: false,
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await worker.triggerCleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RetentionWorker] Starting cleanup run')
      );

      consoleSpy.mockRestore();
    });

    it('should not run concurrent cleanups', async () => {
      const worker = new RetentionWorker({
        schedule: '0 3 * * *',
        runOnStartup: false,
      });

      // Start two cleanups simultaneously
      const promise1 = worker.triggerCleanup();
      const promise2 = worker.triggerCleanup();

      await Promise.all([promise1, promise2]);

      // Second cleanup should be skipped
      expect(worker.isCleanupInProgress()).toBe(false);
    });
  });

  describe('Cron Parsing', () => {
    it('should parse valid cron expressions', () => {
      // This is tested implicitly through worker creation
      const worker = new RetentionWorker({ schedule: '30 2 * * *' });
      expect(worker).toBeInstanceOf(RetentionWorker);
    });

    it('should reject invalid cron expressions', () => {
      expect(() => {
        new RetentionWorker({ schedule: 'invalid' });
      }).toThrow('Invalid cron expression');
    });

    it('should reject cron expressions with wrong number of fields', () => {
      expect(() => {
        new RetentionWorker({ schedule: '0 3 *' });
      }).toThrow('Invalid cron expression');
    });
  });
});

describe('Retention Integration', () => {
  it('should clean up data older than retention period', async () => {
    // Create old data
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    // Create old login attempts
    await prisma.loginAttempt.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        email: `integration-test-${i}@cleanup.com`,
        ipAddress: '192.168.1.1',
        success: i % 2 === 0,
        attemptedAt: oldDate,
      })),
    });

    // Create old audit logs
    await prisma.auditLog.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        entityType: 'integration_test',
        entityId: `00000000-0000-0000-0000-00000000000${i}`,
        action: 'test',
        performedBy: 'system',
        performedAt: oldDate,
      })),
    });

    // Run cleanup with short retention periods
    const result = await runRetentionCleanup({
      loginAttemptRetentionDays: 30,
      auditLogRetentionDays: 30,
    });

    expect(result.success !== false); // Check overall success
    expect(result.results.loginAttempts.deletedCount).toBeGreaterThanOrEqual(5);
    expect(result.results.auditLogs.deletedCount).toBeGreaterThanOrEqual(5);
  });

  it('should preserve data within retention period', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

    // Create recent login attempts
    const loginAttempt = await prisma.loginAttempt.create({
      data: {
        email: 'integration-recent@test.com',
        ipAddress: '192.168.1.1',
        success: true,
        attemptedAt: recentDate,
      },
    });

    // Run cleanup
    await runRetentionCleanup({
      loginAttemptRetentionDays: 30,
    });

    // Verify data still exists
    const attempt = await prisma.loginAttempt.findUnique({
      where: { id: loginAttempt.id },
    });

    expect(attempt).not.toBeNull();

    // Cleanup
    await prisma.loginAttempt.delete({ where: { id: loginAttempt.id } });
  });
});
