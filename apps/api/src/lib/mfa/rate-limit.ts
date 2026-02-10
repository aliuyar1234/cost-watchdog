import { redis } from '../redis.js';
import { MFA_RATE_LIMIT_MAX, MFA_RATE_LIMIT_WINDOW_SECONDS } from './constants.js';
import type { MfaRateLimitResult } from './types.js';

function getRateLimitKey(userId: string): string {
  return `mfa:attempts:${userId}`;
}

export async function checkMfaRateLimit(userId: string): Promise<MfaRateLimitResult> {
  const key = getRateLimitKey(userId);

  try {
    const attempts = await redis.get(key);
    const count = attempts ? Number.parseInt(attempts, 10) : 0;

    if (count >= MFA_RATE_LIMIT_MAX) {
      const ttlSeconds = await redis.ttl(key);
      const lockoutTtlSeconds = ttlSeconds > 0 ? ttlSeconds : MFA_RATE_LIMIT_WINDOW_SECONDS;

      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + lockoutTtlSeconds * 1000),
      };
    }

    return {
      allowed: true,
      remainingAttempts: MFA_RATE_LIMIT_MAX - count,
    };
  } catch {
    return {
      allowed: true,
      remainingAttempts: MFA_RATE_LIMIT_MAX,
    };
  }
}

export async function recordMfaAttempt(userId: string, success: boolean): Promise<void> {
  const key = getRateLimitKey(userId);

  if (success) {
    await redis.del(key).catch(() => {});
    return;
  }

  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, MFA_RATE_LIMIT_WINDOW_SECONDS);
    await multi.exec();
  } catch {
    // Ignore Redis errors in best-effort rate limiting.
  }
}

export async function clearMfaRateLimit(userId: string): Promise<void> {
  await redis.del(getRateLimitKey(userId)).catch(() => {});
}
