/**
 * Session Management Service
 *
 * Provides session tracking, listing, and termination capabilities.
 * Sessions are stored in Redis with metadata about device, location, and activity.
 */

import { redis, blacklistToken } from './redis.js';
import { createHash } from 'crypto';
import UAParser from 'ua-parser-js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Session key prefix
const SESSION_KEY_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

// Session TTL (7 days - matches refresh token)
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// Access token TTL for blacklisting
const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SessionMetadata {
  /** Unique session identifier (JWT jti claim) */
  sessionId: string;
  /** User ID */
  userId: string;
  /** IP address of the session */
  ipAddress: string;
  /** Raw user agent string */
  userAgent: string;
  /** Parsed browser name */
  browser: string;
  /** Parsed browser version */
  browserVersion: string;
  /** Parsed operating system */
  os: string;
  /** Parsed OS version */
  osVersion: string;
  /** Parsed device type (desktop, mobile, tablet) */
  deviceType: string;
  /** Session creation timestamp */
  createdAt: string;
  /** Last activity timestamp */
  lastActivity: string;
  /** Whether this is the current session (set during listing) */
  current?: boolean;
}

export interface ParsedUserAgent {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getSessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

function getUserSessionsKey(userId: string): string {
  return `${USER_SESSIONS_PREFIX}${userId}`;
}

/**
 * Parse user agent string to extract device/browser/OS information.
 */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  if (!userAgent) {
    return {
      browser: 'Unknown',
      browserVersion: '',
      os: 'Unknown',
      osVersion: '',
      deviceType: 'unknown',
    };
  }

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  // Determine device type
  let deviceType = 'desktop';
  if (result.device.type === 'mobile') {
    deviceType = 'mobile';
  } else if (result.device.type === 'tablet') {
    deviceType = 'tablet';
  }

  return {
    browser: result.browser.name || 'Unknown',
    browserVersion: result.browser.version || '',
    os: result.os.name || 'Unknown',
    osVersion: result.os.version || '',
    deviceType,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new session entry when a user logs in.
 */
export async function createSession(
  sessionId: string,
  userId: string,
  ipAddress: string,
  userAgent: string | null | undefined
): Promise<SessionMetadata> {
  const parsed = parseUserAgent(userAgent);
  const now = new Date().toISOString();

  const session: SessionMetadata = {
    sessionId,
    userId,
    ipAddress,
    userAgent: userAgent || '',
    ...parsed,
    createdAt: now,
    lastActivity: now,
  };

  // Store session data
  const sessionKey = getSessionKey(sessionId);
  await redis.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(session));

  // Add to user's session set
  const userSessionsKey = getUserSessionsKey(userId);
  await redis.sadd(userSessionsKey, sessionId);
  await redis.expire(userSessionsKey, SESSION_TTL_SECONDS);

  return session;
}

/**
 * Update session activity timestamp.
 * Called on each authenticated request.
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  const sessionKey = getSessionKey(sessionId);
  const sessionData = await redis.get(sessionKey);

  if (!sessionData) {
    return; // Session doesn't exist or expired
  }

  try {
    const session: SessionMetadata = JSON.parse(sessionData);
    session.lastActivity = new Date().toISOString();

    // Update with new activity timestamp and refresh TTL
    await redis.setex(sessionKey, SESSION_TTL_SECONDS, JSON.stringify(session));
  } catch {
    // Invalid session data, ignore
  }
}

/**
 * Get a single session by ID.
 */
export async function getSession(sessionId: string): Promise<SessionMetadata | null> {
  const sessionKey = getSessionKey(sessionId);
  const sessionData = await redis.get(sessionKey);

  if (!sessionData) {
    return null;
  }

  try {
    return JSON.parse(sessionData) as SessionMetadata;
  } catch {
    return null;
  }
}

/**
 * List all active sessions for a user.
 */
export async function listUserSessions(
  userId: string,
  currentSessionId?: string
): Promise<SessionMetadata[]> {
  const userSessionsKey = getUserSessionsKey(userId);
  const sessionIds = await redis.smembers(userSessionsKey);

  if (sessionIds.length === 0) {
    return [];
  }

  const sessions: SessionMetadata[] = [];
  const expiredSessionIds: string[] = [];

  for (const sessionId of sessionIds) {
    const session = await getSession(sessionId);
    if (session) {
      sessions.push({
        ...session,
        current: sessionId === currentSessionId,
      });
    } else {
      // Session expired but still in set - clean up
      expiredSessionIds.push(sessionId);
    }
  }

  // Clean up expired session references
  if (expiredSessionIds.length > 0) {
    await redis.srem(userSessionsKey, ...expiredSessionIds);
  }

  // Sort by lastActivity descending (most recent first)
  sessions.sort((a, b) =>
    new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  return sessions;
}

/**
 * Terminate a specific session.
 * Deletes session data and blacklists associated tokens.
 */
export async function terminateSession(
  sessionId: string,
  userId: string,
  accessToken?: string,
  refreshToken?: string
): Promise<boolean> {
  const sessionKey = getSessionKey(sessionId);
  const userSessionsKey = getUserSessionsKey(userId);

  // Check if session exists
  const exists = await redis.exists(sessionKey);
  if (!exists) {
    return false;
  }

  // Delete session data
  await redis.del(sessionKey);

  // Remove from user's session set
  await redis.srem(userSessionsKey, sessionId);

  // Blacklist tokens if provided
  if (accessToken) {
    await blacklistToken(accessToken, ACCESS_TOKEN_TTL);
  }
  if (refreshToken) {
    await blacklistToken(refreshToken, REFRESH_TOKEN_TTL);
  }

  // Also blacklist by session ID (JTI claim) to invalidate any tokens with this JTI
  const sessionJtiKey = `token_blacklist:jti:${sessionId}`;
  await redis.setex(sessionJtiKey, REFRESH_TOKEN_TTL, '1');

  return true;
}

/**
 * Terminate all sessions for a user.
 * Used for forced logout, password reset, or account lockout.
 */
export async function terminateAllSessions(userId: string): Promise<number> {
  const userSessionsKey = getUserSessionsKey(userId);
  const sessionIds = await redis.smembers(userSessionsKey);

  if (sessionIds.length === 0) {
    return 0;
  }

  // Delete all session data
  const sessionKeys = sessionIds.map(id => getSessionKey(id));
  await redis.del(...sessionKeys);

  // Blacklist all session JTIs
  const pipeline = redis.pipeline();
  for (const sessionId of sessionIds) {
    const sessionJtiKey = `token_blacklist:jti:${sessionId}`;
    pipeline.setex(sessionJtiKey, REFRESH_TOKEN_TTL, '1');
  }
  await pipeline.exec();

  // Clear user's session set
  await redis.del(userSessionsKey);

  return sessionIds.length;
}

/**
 * Check if a session ID (JTI) has been blacklisted.
 */
export async function isSessionBlacklisted(sessionId: string): Promise<boolean> {
  const sessionJtiKey = `token_blacklist:jti:${sessionId}`;
  const result = await redis.exists(sessionJtiKey);
  return result === 1;
}

/**
 * Get session count for a user.
 */
export async function getSessionCount(userId: string): Promise<number> {
  const userSessionsKey = getUserSessionsKey(userId);
  return await redis.scard(userSessionsKey);
}
