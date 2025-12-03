import Redis from 'ioredis';

/**
 * Redis connection configuration.
 */
const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

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
