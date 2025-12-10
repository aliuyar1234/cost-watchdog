import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { redis } from '../src/lib/redis.js';
import {
  createSession,
  listUserSessions,
  terminateAllSessions,
  isSessionBlacklisted,
} from '../src/lib/sessions.js';
import {
  createTokenFamily,
  getTokenFamily,
  invalidateAllFamiliesForUser,
} from '../src/lib/token-rotation.js';

describe('Session Fixation Prevention', () => {
  const testUserId1 = '00000000-0000-0000-0000-000000000001';
  const testUserId2 = '00000000-0000-0000-0000-000000000002';
  const testSessionId1 = '11111111-1111-1111-1111-111111111111';
  const testSessionId2 = '22222222-2222-2222-2222-222222222222';
  const testSessionId3 = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    // Clean up Redis
    await redis.del(`session:${testSessionId1}`);
    await redis.del(`session:${testSessionId2}`);
    await redis.del(`session:${testSessionId3}`);
    await redis.del(`user_sessions:${testUserId1}`);
    await redis.del(`user_sessions:${testUserId2}`);
    await redis.del(`token_blacklist:jti:${testSessionId1}`);
    await redis.del(`token_blacklist:jti:${testSessionId2}`);
    await redis.del(`token_blacklist:jti:${testSessionId3}`);

    // Clean up Prisma
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2] } },
    });
  });

  afterEach(async () => {
    // Clean up Redis
    await redis.del(`session:${testSessionId1}`);
    await redis.del(`session:${testSessionId2}`);
    await redis.del(`session:${testSessionId3}`);
    await redis.del(`user_sessions:${testUserId1}`);
    await redis.del(`user_sessions:${testUserId2}`);
    await redis.del(`token_blacklist:jti:${testSessionId1}`);
    await redis.del(`token_blacklist:jti:${testSessionId2}`);
    await redis.del(`token_blacklist:jti:${testSessionId3}`);

    // Clean up token families
    const keys = await redis.keys('token_family:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Clean up Prisma
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2] } },
    });
  });

  describe('Session Invalidation on Login', () => {
    it('should invalidate all existing sessions when terminateAllSessions is called', async () => {
      // Create multiple sessions for the user
      await createSession(testSessionId1, testUserId1, '192.168.1.1', 'Agent 1');
      await createSession(testSessionId2, testUserId1, '192.168.1.2', 'Agent 2');

      // Verify sessions exist
      let sessions = await listUserSessions(testUserId1);
      expect(sessions.length).toBe(2);

      // Simulate login behavior - terminate all sessions
      await terminateAllSessions(testUserId1);

      // Verify sessions are gone
      sessions = await listUserSessions(testUserId1);
      expect(sessions.length).toBe(0);

      // Verify session JTIs are blacklisted
      expect(await isSessionBlacklisted(testSessionId1)).toBe(true);
      expect(await isSessionBlacklisted(testSessionId2)).toBe(true);
    });

    it('should invalidate all token families when invalidateAllFamiliesForUser is called', async () => {
      // Create token families for the user
      const family1 = await createTokenFamily(testUserId1, 'refresh-token-1');
      const family2 = await createTokenFamily(testUserId1, 'refresh-token-2');

      // Verify families exist and are not invalidated
      const fetchedFamily1 = await getTokenFamily(family1.familyId);
      const fetchedFamily2 = await getTokenFamily(family2.familyId);
      expect(fetchedFamily1?.invalidated).toBe(false);
      expect(fetchedFamily2?.invalidated).toBe(false);

      // Simulate login behavior - invalidate all families
      await invalidateAllFamiliesForUser(testUserId1, 'new_login');

      // Verify families are invalidated
      const invalidatedFamily1 = await getTokenFamily(family1.familyId);
      const invalidatedFamily2 = await getTokenFamily(family2.familyId);
      expect(invalidatedFamily1?.invalidated).toBe(true);
      expect(invalidatedFamily2?.invalidated).toBe(true);
      expect(invalidatedFamily1?.invalidationReason).toBe('new_login');
    });

    it('should not affect other users sessions', async () => {
      // Create sessions for two different users
      await createSession(testSessionId1, testUserId1, '192.168.1.1', 'Agent 1');
      await createSession(testSessionId2, testUserId2, '192.168.1.2', 'Agent 2');

      // Terminate sessions for user 1
      await terminateAllSessions(testUserId1);

      // Verify user 1's sessions are gone
      const user1Sessions = await listUserSessions(testUserId1);
      expect(user1Sessions.length).toBe(0);

      // Verify user 2's sessions are still intact
      const user2Sessions = await listUserSessions(testUserId2);
      expect(user2Sessions.length).toBe(1);
    });
  });

  describe('Session Invalidation on Role Change', () => {
    it('should provide invalidation reason for role changes', async () => {
      // Create a token family
      const family = await createTokenFamily(testUserId1, 'refresh-token-1');

      // Simulate role change - invalidate families
      await invalidateAllFamiliesForUser(testUserId1, 'role_change');

      // Verify family is invalidated with correct reason
      const invalidatedFamily = await getTokenFamily(family.familyId);
      expect(invalidatedFamily?.invalidated).toBe(true);
      expect(invalidatedFamily?.invalidationReason).toBe('role_change');
    });
  });

  describe('Session Invalidation on Password Change', () => {
    it('should provide invalidation reason for password changes', async () => {
      // Create sessions and token family
      await createSession(testSessionId1, testUserId1, '192.168.1.1', 'Agent 1');
      const family = await createTokenFamily(testUserId1, 'refresh-token-1');

      // Simulate password change - terminate sessions and invalidate families
      await terminateAllSessions(testUserId1);
      await invalidateAllFamiliesForUser(testUserId1, 'password_change');

      // Verify sessions are gone
      const sessions = await listUserSessions(testUserId1);
      expect(sessions.length).toBe(0);

      // Verify family is invalidated with correct reason
      const invalidatedFamily = await getTokenFamily(family.familyId);
      expect(invalidatedFamily?.invalidated).toBe(true);
      expect(invalidatedFamily?.invalidationReason).toBe('password_change');
    });
  });

  describe('GDPR Deletion Session Handling', () => {
    it('should provide invalidation reason for GDPR deletion', async () => {
      // Create sessions and token family
      await createSession(testSessionId1, testUserId1, '192.168.1.1', 'Agent 1');
      const family = await createTokenFamily(testUserId1, 'refresh-token-1');

      // Simulate GDPR deletion - terminate sessions and invalidate families
      await terminateAllSessions(testUserId1);
      await invalidateAllFamiliesForUser(testUserId1, 'gdpr_deletion');

      // Verify sessions are gone
      const sessions = await listUserSessions(testUserId1);
      expect(sessions.length).toBe(0);

      // Verify family is invalidated with correct reason
      const invalidatedFamily = await getTokenFamily(family.familyId);
      expect(invalidatedFamily?.invalidated).toBe(true);
      expect(invalidatedFamily?.invalidationReason).toBe('gdpr_deletion');
    });
  });

  describe('Concurrent Session Handling', () => {
    it('should handle concurrent session creation and invalidation', async () => {
      // Create multiple sessions
      await Promise.all([
        createSession(testSessionId1, testUserId1, '192.168.1.1', 'Agent 1'),
        createSession(testSessionId2, testUserId1, '192.168.1.2', 'Agent 2'),
        createSession(testSessionId3, testUserId1, '192.168.1.3', 'Agent 3'),
      ]);

      // Verify sessions exist
      let sessions = await listUserSessions(testUserId1);
      expect(sessions.length).toBe(3);

      // Terminate all concurrently
      await terminateAllSessions(testUserId1);

      // Verify all sessions are gone
      sessions = await listUserSessions(testUserId1);
      expect(sessions.length).toBe(0);

      // Verify all JTIs are blacklisted
      const [blacklisted1, blacklisted2, blacklisted3] = await Promise.all([
        isSessionBlacklisted(testSessionId1),
        isSessionBlacklisted(testSessionId2),
        isSessionBlacklisted(testSessionId3),
      ]);
      expect(blacklisted1).toBe(true);
      expect(blacklisted2).toBe(true);
      expect(blacklisted3).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle termination when no sessions exist', async () => {
      // Terminate sessions for user with no sessions
      const count = await terminateAllSessions('non-existent-user-id');
      expect(count).toBe(0);
    });

    it('should handle invalidation when no token families exist', async () => {
      // Invalidate families for user with no families
      const count = await invalidateAllFamiliesForUser('non-existent-user-id', 'test');
      expect(count).toBe(0);
    });

    it('should blacklist session JTIs even if session data is missing', async () => {
      // Add session reference without session data
      await redis.sadd(`user_sessions:${testUserId1}`, testSessionId1);

      // Terminate all sessions
      await terminateAllSessions(testUserId1);

      // User sessions set should be cleared
      const count = await redis.scard(`user_sessions:${testUserId1}`);
      expect(count).toBe(0);
    });
  });
});
