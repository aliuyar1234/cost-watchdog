import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from './redis.js';

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Window size in seconds */
  windowSeconds: number;
  /** Maximum requests per window */
  maxRequests: number;
  /** Key prefix for Redis */
  keyPrefix?: string;
  /** Whether to fail closed (deny) on Redis errors. Default: true in production */
  failClosed?: boolean;
}

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

/**
 * Rate limit result.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

/**
 * Default rate limits by endpoint type.
 */
export const RATE_LIMITS = {
  default: { windowSeconds: 60, maxRequests: 100 },
  auth: { windowSeconds: 60, maxRequests: 10 },
  upload: { windowSeconds: 60, maxRequests: 20 },
  export: { windowSeconds: 60, maxRequests: 10 },
  api_key: { windowSeconds: 60, maxRequests: 1000 },
} as const;

/**
 * Check rate limit for a key.
 * In production, fails closed (denies requests) when Redis is unavailable for security.
 * In development, fails open (allows requests) for convenience.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const resetAt = new Date((now + config.windowSeconds) * 1000);
  const failClosed = config.failClosed ?? IS_PRODUCTION;

  try {
    const prefix = config.keyPrefix || 'rate_limit';
    const redisKey = `${prefix}:${key}`;
    const windowStart = now - config.windowSeconds;

    // Use Redis sorted set for sliding window
    const pipeline = redis.pipeline();

    // Remove old entries
    pipeline.zremrangebyscore(redisKey, 0, windowStart);

    // Add current request
    pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);

    // Count requests in window
    pipeline.zcard(redisKey);

    // Set expiry
    pipeline.expire(redisKey, config.windowSeconds);

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) || 0;

    const allowed = count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count);

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : config.windowSeconds,
    };
  } catch (error) {
    console.error('[RateLimit] Redis error:', error instanceof Error ? error.message : 'Unknown error');

    // Security: Fail closed in production to prevent brute-force attacks during Redis outages
    if (failClosed) {
      console.warn('[RateLimit] Failing closed - denying request due to Redis unavailability');
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: 60, // Retry after 1 minute
      };
    }

    // Development: Fail open for convenience
    console.warn('[RateLimit] Failing open - allowing request (development mode)');
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt,
      retryAfter: undefined,
    };
  }
}

/**
 * Get rate limit key from request.
 */
export function getRateLimitKey(request: FastifyRequest): string {
  // Use API key if present
  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    return `api:${apiKey.substring(0, 16)}`;
  }

  // Use user ID if authenticated
  if (request.user?.sub) {
    return `user:${request.user.sub}`;
  }

  // Fall back to IP
  const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limit hook for Fastify.
 * In production, fails closed (denies requests) on errors for security.
 */
export function createRateLimitHook(config: RateLimitConfig = RATE_LIMITS.default) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const key = getRateLimitKey(request);
      const result = await checkRateLimit(key, config);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', config.maxRequests);
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000));

      if (!result.allowed) {
        reply.header('Retry-After', result.retryAfter);
        return reply.status(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
        });
      }
    } catch (error) {
      console.error('[RateLimit] Hook error:', error instanceof Error ? error.message : 'Unknown error');

      // Security: Fail closed in production
      if (IS_PRODUCTION) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'Rate limiting service temporarily unavailable. Please try again.',
        });
      }
    }
  };
}

/**
 * Rate limit decorator for specific endpoints.
 */
export function rateLimitEndpoint(type: keyof typeof RATE_LIMITS) {
  return createRateLimitHook(RATE_LIMITS[type]);
}
