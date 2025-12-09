import Redis from 'ioredis';
import { secrets } from './secrets.js';

/**
 * Redis connection configuration.
 * Reads from /run/secrets/redis_url first, falls back to REDIS_URL env var.
 * In production, REDIS_URL must be explicitly set.
 */
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const REDIS_URL_SECRET = secrets.getRedisUrl();

// Validate Redis URL in production
if (IS_PRODUCTION && !REDIS_URL_SECRET) {
  throw new Error('FATAL: REDIS_URL is required in production (via Docker secret or env var)');
}

const REDIS_URL = REDIS_URL_SECRET || 'redis://localhost:6379';

/**
 * Shared Redis client for general operations.
 */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

/**
 * Create a new Redis connection for BullMQ workers.
 * Each worker needs its own connection.
 */
export function createRedisConnection(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/**
 * Check Redis connection health.
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully close Redis connections.
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}

// Token blacklist key prefix
const TOKEN_BLACKLIST_PREFIX = 'token_blacklist:';

/**
 * Add a token to the blacklist.
 * Token will be automatically removed after the specified TTL.
 *
 * @param token - The token to blacklist
 * @param ttlSeconds - Time to live in seconds (should match token expiry)
 */
export async function blacklistToken(token: string, ttlSeconds: number): Promise<void> {
  try {
    // Use the token itself as part of the key (hashed for privacy)
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex').substring(0, 32);
    const key = `${TOKEN_BLACKLIST_PREFIX}${tokenHash}`;
    await redis.setex(key, ttlSeconds, '1');
  } catch (error) {
    console.error('[TokenBlacklist] Failed to blacklist token:', error);
    // In production, we should not fail silently - re-throw
    if (IS_PRODUCTION) {
      throw error;
    }
  }
}

/**
 * Check if a token is blacklisted.
 *
 * @param token - The token to check
 * @returns true if the token is blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex').substring(0, 32);
    const key = `${TOKEN_BLACKLIST_PREFIX}${tokenHash}`;
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    console.error('[TokenBlacklist] Failed to check blacklist:', error);
    // In production, fail closed (assume token is blacklisted)
    if (IS_PRODUCTION) {
      return true;
    }
    return false;
  }
}
