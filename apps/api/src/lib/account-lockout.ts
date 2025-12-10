/**
 * Account Lockout Service
 *
 * Protects against brute-force attacks by:
 * - Tracking failed login attempts
 * - Locking accounts after too many failures
 * - Implementing progressive lockout (longer lockouts for repeat offenders)
 */

import { redis } from './redis.js';
import { accountLockoutsTotal, failedLoginAttemptsTotal } from './metrics.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Number of failed attempts before temporary lockout
const MAX_FAILED_ATTEMPTS = 5;

// Time window for counting failed attempts (15 minutes)
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

// Initial lockout duration (15 minutes)
const INITIAL_LOCKOUT_SECONDS = 15 * 60;

// Number of lockouts before requiring admin unlock
const MAX_LOCKOUTS_BEFORE_ADMIN = 3;

// Redis key prefixes
const ATTEMPTS_KEY_PREFIX = 'lockout:attempts:';
const LOCKOUT_KEY_PREFIX = 'lockout:locked:';
const LOCKOUT_COUNT_KEY_PREFIX = 'lockout:count:';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LockoutStatus {
  locked: boolean;
  reason?: 'temporary' | 'permanent';
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getAttemptsKey(email: string): string {
  return `${ATTEMPTS_KEY_PREFIX}${email.toLowerCase()}`;
}

function getLockoutKey(email: string): string {
  return `${LOCKOUT_KEY_PREFIX}${email.toLowerCase()}`;
}

function getLockoutCountKey(email: string): string {
  return `${LOCKOUT_COUNT_KEY_PREFIX}${email.toLowerCase()}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCKOUT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an account is currently locked out.
 */
export async function checkLockout(email: string): Promise<LockoutStatus> {
  const lockoutKey = getLockoutKey(email);

  // Check if locked
  const lockoutValue = await redis.get(lockoutKey);

  if (lockoutValue) {
    const ttl = await redis.ttl(lockoutKey);

    // Check if it's a permanent lockout (requires admin)
    if (lockoutValue === 'permanent') {
      return {
        locked: true,
        reason: 'permanent',
      };
    }

    return {
      locked: true,
      reason: 'temporary',
      retryAfterSeconds: ttl > 0 ? ttl : 0,
    };
  }

  // Not locked - check remaining attempts
  const attemptsKey = getAttemptsKey(email);
  const attempts = await redis.get(attemptsKey);
  const attemptCount = attempts ? parseInt(attempts, 10) : 0;

  return {
    locked: false,
    attemptsRemaining: MAX_FAILED_ATTEMPTS - attemptCount,
  };
}

/**
 * Record a failed login attempt.
 * Returns the new lockout status (may trigger lockout).
 */
export async function recordFailedAttempt(
  email: string,
  reason: string = 'invalid_credentials'
): Promise<LockoutStatus> {
  const attemptsKey = getAttemptsKey(email);
  const lockoutKey = getLockoutKey(email);
  const lockoutCountKey = getLockoutCountKey(email);

  // Increment failed attempts
  const attempts = await redis.incr(attemptsKey);

  // Set expiry on first attempt
  if (attempts === 1) {
    await redis.expire(attemptsKey, ATTEMPT_WINDOW_SECONDS);
  }

  // Record metric
  failedLoginAttemptsTotal.labels(reason).inc();

  // Check if we need to lock the account
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    // Increment lockout count
    const lockoutCount = await redis.incr(lockoutCountKey);

    // If too many lockouts, require admin unlock
    if (lockoutCount >= MAX_LOCKOUTS_BEFORE_ADMIN) {
      await redis.set(lockoutKey, 'permanent');
      // Keep permanent lockout until admin clears it
      // No expiry on lockout count key either

      accountLockoutsTotal.inc();

      return {
        locked: true,
        reason: 'permanent',
      };
    }

    // Calculate progressive lockout duration
    // 15 min, 30 min, 45 min based on lockout count
    const lockoutDuration = INITIAL_LOCKOUT_SECONDS * lockoutCount;

    // Set temporary lockout
    await redis.setex(lockoutKey, lockoutDuration, 'temporary');

    // Clear failed attempts counter
    await redis.del(attemptsKey);

    // Keep lockout count for 24 hours
    await redis.expire(lockoutCountKey, 24 * 60 * 60);

    accountLockoutsTotal.inc();

    return {
      locked: true,
      reason: 'temporary',
      retryAfterSeconds: lockoutDuration,
    };
  }

  return {
    locked: false,
    attemptsRemaining: MAX_FAILED_ATTEMPTS - attempts,
  };
}

/**
 * Reset failed attempts after successful login.
 */
export async function resetAttempts(email: string): Promise<void> {
  const attemptsKey = getAttemptsKey(email);
  await redis.del(attemptsKey);
}

/**
 * Lock an account immediately (e.g., by admin action).
 */
export async function lockAccount(email: string, permanent: boolean = false): Promise<void> {
  const lockoutKey = getLockoutKey(email);

  if (permanent) {
    await redis.set(lockoutKey, 'permanent');
  } else {
    await redis.setex(lockoutKey, INITIAL_LOCKOUT_SECONDS, 'temporary');
  }

  accountLockoutsTotal.inc();
}

/**
 * Unlock an account (admin action).
 * Clears all lockout data for the account.
 */
export async function unlockAccount(email: string): Promise<void> {
  const attemptsKey = getAttemptsKey(email);
  const lockoutKey = getLockoutKey(email);
  const lockoutCountKey = getLockoutCountKey(email);

  await Promise.all([
    redis.del(attemptsKey),
    redis.del(lockoutKey),
    redis.del(lockoutCountKey),
  ]);
}

/**
 * Invalidate all sessions for a user (called on lockout).
 * Uses the existing token blacklist mechanism.
 */
export async function invalidateAllSessionsForUser(userId: string): Promise<void> {
  // This is a placeholder - the actual implementation would need to:
  // 1. Get all active sessions for the user from Redis
  // 2. Add each session's JTI to the blacklist
  // For now, we'll implement a simpler approach using a user-level blacklist

  const userBlacklistKey = `blacklist:user:${userId}`;
  const now = Math.floor(Date.now() / 1000);

  // Store the timestamp - any tokens issued before this are invalid
  await redis.set(userBlacklistKey, now.toString());
  // Keep for 7 days (max refresh token lifetime)
  await redis.expire(userBlacklistKey, 7 * 24 * 60 * 60);
}

/**
 * Check if user's tokens are blacklisted (for lockout).
 */
export async function isUserBlacklisted(userId: string, tokenIssuedAt: number): Promise<boolean> {
  const userBlacklistKey = `blacklist:user:${userId}`;
  const blacklistTimestamp = await redis.get(userBlacklistKey);

  if (!blacklistTimestamp) {
    return false;
  }

  // Token is blacklisted if it was issued before the blacklist timestamp
  return tokenIssuedAt < parseInt(blacklistTimestamp, 10);
}
