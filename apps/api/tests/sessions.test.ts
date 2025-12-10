import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { redis } from '../src/lib/redis.js';
import {
  createSession,
  getSession,
  listUserSessions,
  terminateSession,
  terminateAllSessions,
  updateSessionActivity,
  getSessionCount,
  isSessionBlacklisted,
  parseUserAgent,
} from '../src/lib/sessions.js';

describe('Sessions Service', () => {
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const testSessionId = '11111111-1111-1111-1111-111111111111';
  const testSessionId2 = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    // Clean up test data
    await redis.del(`session:${testSessionId}`);
    await redis.del(`session:${testSessionId2}`);
    await redis.del(`user_sessions:${testUserId}`);
    await redis.del(`token_blacklist:jti:${testSessionId}`);
    await redis.del(`token_blacklist:jti:${testSessionId2}`);
  });

  afterEach(async () => {
    await redis.del(`session:${testSessionId}`);
    await redis.del(`session:${testSessionId2}`);
    await redis.del(`user_sessions:${testUserId}`);
    await redis.del(`token_blacklist:jti:${testSessionId}`);
    await redis.del(`token_blacklist:jti:${testSessionId2}`);
  });

  describe('parseUserAgent', () => {
    it('should parse Chrome on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const result = parseUserAgent(ua);

      expect(result.browser).toBe('Chrome');
      expect(result.os).toBe('Windows');
      expect(result.deviceType).toBe('desktop');
    });

    it('should parse Safari on iOS', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      const result = parseUserAgent(ua);

      expect(result.browser).toBe('Mobile Safari');
      expect(result.os).toBe('iOS');
      expect(result.deviceType).toBe('mobile');
    });

    it('should parse Firefox on Linux', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
      const result = parseUserAgent(ua);

      expect(result.browser).toBe('Firefox');
      expect(result.os).toBe('Linux');
      expect(result.deviceType).toBe('desktop');
    });

    it('should handle null user agent', () => {
      const result = parseUserAgent(null);

      expect(result.browser).toBe('Unknown');
      expect(result.os).toBe('Unknown');
      expect(result.deviceType).toBe('unknown');
    });

    it('should handle undefined user agent', () => {
      const result = parseUserAgent(undefined);

      expect(result.browser).toBe('Unknown');
      expect(result.os).toBe('Unknown');
    });

    it('should handle empty string', () => {
      const result = parseUserAgent('');

      expect(result.browser).toBe('Unknown');
      expect(result.os).toBe('Unknown');
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await createSession(
        testSessionId,
        testUserId,
        '192.168.1.1',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      );

      expect(session.sessionId).toBe(testSessionId);
      expect(session.userId).toBe(testUserId);
      expect(session.ipAddress).toBe('192.168.1.1');
      expect(session.browser).toBeDefined();
      expect(session.os).toBeDefined();
      expect(session.createdAt).toBeDefined();
      expect(session.lastActivity).toBeDefined();
    });

    it('should store session in Redis', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Test Agent');

      const stored = await redis.get(`session:${testSessionId}`);
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.sessionId).toBe(testSessionId);
    });

    it('should add session to user sessions set', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Test Agent');

      const isMember = await redis.sismember(`user_sessions:${testUserId}`, testSessionId);
      expect(isMember).toBe(1);
    });

    it('should handle null user agent', async () => {
      const session = await createSession(testSessionId, testUserId, '192.168.1.1', null);

      expect(session.userAgent).toBe('');
      expect(session.browser).toBe('Unknown');
    });
  });

  describe('getSession', () => {
    it('should return session by id', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Test Agent');

      const session = await getSession(testSessionId);

      expect(session).toBeTruthy();
      expect(session?.sessionId).toBe(testSessionId);
    });

    it('should return null for non-existent session', async () => {
      const session = await getSession('non-existent');
      expect(session).toBeNull();
    });
  });

  describe('listUserSessions', () => {
    it('should list all sessions for a user', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent 1');
      await createSession(testSessionId2, testUserId, '192.168.1.2', 'Agent 2');

      const sessions = await listUserSessions(testUserId);

      expect(sessions.length).toBe(2);
    });

    it('should mark current session', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent 1');
      await createSession(testSessionId2, testUserId, '192.168.1.2', 'Agent 2');

      const sessions = await listUserSessions(testUserId, testSessionId);

      const currentSession = sessions.find(s => s.sessionId === testSessionId);
      const otherSession = sessions.find(s => s.sessionId === testSessionId2);

      expect(currentSession?.current).toBe(true);
      expect(otherSession?.current).toBe(false);
    });

    it('should return empty array for user with no sessions', async () => {
      const sessions = await listUserSessions('no-sessions-user');
      expect(sessions).toEqual([]);
    });

    it('should sort by lastActivity descending', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent 1');

      // Wait a bit and create second session
      await new Promise(resolve => setTimeout(resolve, 10));
      await createSession(testSessionId2, testUserId, '192.168.1.2', 'Agent 2');

      const sessions = await listUserSessions(testUserId);

      // Most recent should be first
      expect(sessions[0].sessionId).toBe(testSessionId2);
    });

    it('should clean up expired session references', async () => {
      // Add a session reference without actual session data
      await redis.sadd(`user_sessions:${testUserId}`, 'expired-session');
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent 1');

      const sessions = await listUserSessions(testUserId);

      expect(sessions.length).toBe(1);
      expect(sessions[0].sessionId).toBe(testSessionId);

      // Expired reference should be removed
      const isMember = await redis.sismember(`user_sessions:${testUserId}`, 'expired-session');
      expect(isMember).toBe(0);
    });
  });

  describe('updateSessionActivity', () => {
    it('should update lastActivity timestamp', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent');

      const before = await getSession(testSessionId);
      await new Promise(resolve => setTimeout(resolve, 10));
      await updateSessionActivity(testSessionId);
      const after = await getSession(testSessionId);

      expect(new Date(after!.lastActivity).getTime()).toBeGreaterThan(
        new Date(before!.lastActivity).getTime()
      );
    });

    it('should not throw for non-existent session', async () => {
      await expect(updateSessionActivity('non-existent')).resolves.not.toThrow();
    });
  });

  describe('terminateSession', () => {
    it('should delete session', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent');

      const result = await terminateSession(testSessionId, testUserId);

      expect(result).toBe(true);
      const session = await getSession(testSessionId);
      expect(session).toBeNull();
    });

    it('should remove from user sessions set', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent');

      await terminateSession(testSessionId, testUserId);

      const isMember = await redis.sismember(`user_sessions:${testUserId}`, testSessionId);
      expect(isMember).toBe(0);
    });

    it('should blacklist session JTI', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent');

      await terminateSession(testSessionId, testUserId);

      const isBlacklisted = await isSessionBlacklisted(testSessionId);
      expect(isBlacklisted).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const result = await terminateSession('non-existent', testUserId);
      expect(result).toBe(false);
    });
  });

  describe('terminateAllSessions', () => {
    it('should terminate all sessions for user', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent 1');
      await createSession(testSessionId2, testUserId, '192.168.1.2', 'Agent 2');

      const count = await terminateAllSessions(testUserId);

      expect(count).toBe(2);

      const session1 = await getSession(testSessionId);
      const session2 = await getSession(testSessionId2);
      expect(session1).toBeNull();
      expect(session2).toBeNull();
    });

    it('should blacklist all session JTIs', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent 1');
      await createSession(testSessionId2, testUserId, '192.168.1.2', 'Agent 2');

      await terminateAllSessions(testUserId);

      expect(await isSessionBlacklisted(testSessionId)).toBe(true);
      expect(await isSessionBlacklisted(testSessionId2)).toBe(true);
    });

    it('should clear user sessions set', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent');

      await terminateAllSessions(testUserId);

      const count = await redis.scard(`user_sessions:${testUserId}`);
      expect(count).toBe(0);
    });

    it('should return 0 for user with no sessions', async () => {
      const count = await terminateAllSessions('no-sessions-user');
      expect(count).toBe(0);
    });
  });

  describe('getSessionCount', () => {
    it('should return correct session count', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent 1');
      await createSession(testSessionId2, testUserId, '192.168.1.2', 'Agent 2');

      const count = await getSessionCount(testUserId);
      expect(count).toBe(2);
    });

    it('should return 0 for user with no sessions', async () => {
      const count = await getSessionCount('no-sessions-user');
      expect(count).toBe(0);
    });
  });

  describe('isSessionBlacklisted', () => {
    it('should return false for non-blacklisted session', async () => {
      const result = await isSessionBlacklisted('some-session-id');
      expect(result).toBe(false);
    });

    it('should return true for blacklisted session', async () => {
      await createSession(testSessionId, testUserId, '192.168.1.1', 'Agent');
      await terminateSession(testSessionId, testUserId);

      const result = await isSessionBlacklisted(testSessionId);
      expect(result).toBe(true);
    });
  });
});
