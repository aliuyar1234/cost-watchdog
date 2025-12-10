import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { redis } from '../src/lib/redis.js';
import {
  checkLockout,
  recordFailedAttempt,
  resetAttempts,
  lockAccount,
  unlockAccount,
  invalidateAllSessionsForUser,
  isUserBlacklisted,
} from '../src/lib/account-lockout.js';

describe('Account Lockout Service', () => {
  const testEmail = 'lockout-test@example.com';
  const testUserId = '00000000-0000-0000-0000-000000000001';

  // Clean up Redis keys before and after each test
  beforeEach(async () => {
    await redis.del(`lockout:attempts:${testEmail}`);
    await redis.del(`lockout:locked:${testEmail}`);
    await redis.del(`lockout:count:${testEmail}`);
    await redis.del(`blacklist:user:${testUserId}`);
  });

  afterEach(async () => {
    await redis.del(`lockout:attempts:${testEmail}`);
    await redis.del(`lockout:locked:${testEmail}`);
    await redis.del(`lockout:count:${testEmail}`);
    await redis.del(`blacklist:user:${testUserId}`);
  });

  describe('checkLockout', () => {
    it('should return not locked for new account', async () => {
      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(false);
      expect(status.attemptsRemaining).toBe(5);
    });

    it('should return locked status for temporarily locked account', async () => {
      await lockAccount(testEmail, false);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(true);
      expect(status.reason).toBe('temporary');
      expect(status.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should return locked status for permanently locked account', async () => {
      await lockAccount(testEmail, true);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(true);
      expect(status.reason).toBe('permanent');
    });

    it('should show remaining attempts after failed attempt', async () => {
      await recordFailedAttempt(testEmail);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(false);
      expect(status.attemptsRemaining).toBe(4);
    });
  });

  describe('recordFailedAttempt', () => {
    it('should increment attempt count', async () => {
      await recordFailedAttempt(testEmail);
      const status = await checkLockout(testEmail);
      expect(status.attemptsRemaining).toBe(4);

      await recordFailedAttempt(testEmail);
      const status2 = await checkLockout(testEmail);
      expect(status2.attemptsRemaining).toBe(3);
    });

    it('should lock account after 5 failed attempts', async () => {
      for (let i = 0; i < 4; i++) {
        await recordFailedAttempt(testEmail);
      }

      // 5th attempt should trigger lockout
      const status = await recordFailedAttempt(testEmail);
      expect(status.locked).toBe(true);
      expect(status.reason).toBe('temporary');
    });

    it('should return remaining attempts before lockout', async () => {
      const status1 = await recordFailedAttempt(testEmail);
      expect(status1.locked).toBe(false);
      expect(status1.attemptsRemaining).toBe(4);

      const status2 = await recordFailedAttempt(testEmail);
      expect(status2.locked).toBe(false);
      expect(status2.attemptsRemaining).toBe(3);
    });

    it('should track lockout count for progressive lockout', async () => {
      // First lockout (15 min)
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(testEmail);
      }

      const status1 = await checkLockout(testEmail);
      expect(status1.locked).toBe(true);
      expect(status1.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);

      // Reset for second lockout
      await redis.del(`lockout:locked:${testEmail}`);

      // Second lockout (30 min)
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(testEmail);
      }

      const status2 = await checkLockout(testEmail);
      expect(status2.locked).toBe(true);
      // Should be longer than first lockout
      expect(status2.retryAfterSeconds).toBeLessThanOrEqual(30 * 60);
    });

    it('should permanently lock after 3 lockouts', async () => {
      // Simulate 3 lockout cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Clear the lockout but keep the count
        await redis.del(`lockout:locked:${testEmail}`);

        for (let i = 0; i < 5; i++) {
          await recordFailedAttempt(testEmail);
        }
      }

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(true);
      expect(status.reason).toBe('permanent');
    });
  });

  describe('resetAttempts', () => {
    it('should clear failed attempts on successful login', async () => {
      await recordFailedAttempt(testEmail);
      await recordFailedAttempt(testEmail);

      await resetAttempts(testEmail);

      const status = await checkLockout(testEmail);
      expect(status.attemptsRemaining).toBe(5);
    });

    it('should not affect lockout status', async () => {
      await lockAccount(testEmail, false);
      await resetAttempts(testEmail);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(true);
    });
  });

  describe('lockAccount', () => {
    it('should temporarily lock account', async () => {
      await lockAccount(testEmail, false);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(true);
      expect(status.reason).toBe('temporary');
    });

    it('should permanently lock account', async () => {
      await lockAccount(testEmail, true);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(true);
      expect(status.reason).toBe('permanent');
    });
  });

  describe('unlockAccount', () => {
    it('should unlock temporarily locked account', async () => {
      await lockAccount(testEmail, false);
      await unlockAccount(testEmail);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(false);
    });

    it('should unlock permanently locked account', async () => {
      await lockAccount(testEmail, true);
      await unlockAccount(testEmail);

      const status = await checkLockout(testEmail);
      expect(status.locked).toBe(false);
    });

    it('should clear attempt history', async () => {
      await recordFailedAttempt(testEmail);
      await recordFailedAttempt(testEmail);
      await unlockAccount(testEmail);

      const status = await checkLockout(testEmail);
      expect(status.attemptsRemaining).toBe(5);
    });

    it('should reset lockout count', async () => {
      // Create a lockout
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(testEmail);
      }

      await unlockAccount(testEmail);

      // Next lockout should be 15 min again (not progressive)
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(testEmail);
      }

      const status = await checkLockout(testEmail);
      expect(status.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    });
  });

  describe('invalidateAllSessionsForUser', () => {
    it('should create user blacklist entry', async () => {
      await invalidateAllSessionsForUser(testUserId);

      const blacklistKey = `blacklist:user:${testUserId}`;
      const value = await redis.get(blacklistKey);
      expect(value).toBeTruthy();
    });

    it('should set timestamp for blacklist', async () => {
      const before = Math.floor(Date.now() / 1000);
      await invalidateAllSessionsForUser(testUserId);
      const after = Math.floor(Date.now() / 1000);

      const blacklistKey = `blacklist:user:${testUserId}`;
      const value = await redis.get(blacklistKey);
      const timestamp = parseInt(value!, 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('isUserBlacklisted', () => {
    it('should return false for non-blacklisted user', async () => {
      const result = await isUserBlacklisted(testUserId, Math.floor(Date.now() / 1000));
      expect(result).toBe(false);
    });

    it('should return true for token issued before blacklist', async () => {
      const tokenIssuedAt = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      await invalidateAllSessionsForUser(testUserId);

      const result = await isUserBlacklisted(testUserId, tokenIssuedAt);
      expect(result).toBe(true);
    });

    it('should return false for token issued after blacklist', async () => {
      await invalidateAllSessionsForUser(testUserId);
      const tokenIssuedAt = Math.floor(Date.now() / 1000) + 1; // 1 second in future

      const result = await isUserBlacklisted(testUserId, tokenIssuedAt);
      expect(result).toBe(false);
    });
  });

  describe('Email normalization', () => {
    const normalizeTestEmail = `normalize-test-${Date.now()}@example.com`;
    const normalizeTestEmailUpper = normalizeTestEmail.replace('normalize', 'NORMALIZE').replace('example', 'EXAMPLE');

    beforeEach(async () => {
      await redis.del(`lockout:attempts:${normalizeTestEmail.toLowerCase()}`);
      await redis.del(`lockout:locked:${normalizeTestEmail.toLowerCase()}`);
      await redis.del(`lockout:count:${normalizeTestEmail.toLowerCase()}`);
    });

    afterEach(async () => {
      await redis.del(`lockout:attempts:${normalizeTestEmail.toLowerCase()}`);
      await redis.del(`lockout:locked:${normalizeTestEmail.toLowerCase()}`);
      await redis.del(`lockout:count:${normalizeTestEmail.toLowerCase()}`);
    });

    it('should treat email case-insensitively', async () => {
      await recordFailedAttempt(normalizeTestEmailUpper);

      const status = await checkLockout(normalizeTestEmail.toLowerCase());
      expect(status.attemptsRemaining).toBe(4);
    });
  });
});
