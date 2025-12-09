import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Create mock pipeline outside vi.mock for reference
const mockPipeline = {
  zremrangebyscore: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

// Mock Redis before importing rate-limit module
vi.mock('../src/lib/redis.js', () => ({
  redis: {
    pipeline: () => mockPipeline,
  },
}));

// Import after mock setup
const { checkRateLimit, getRateLimitKey, createRateLimitHook, RATE_LIMITS } = await import('../src/lib/rate-limit.js');

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockPipeline.zremrangebyscore.mockReturnThis();
    mockPipeline.zadd.mockReturnThis();
    mockPipeline.zcard.mockReturnThis();
    mockPipeline.expire.mockReturnThis();
    // Default: allow requests (count under limit)
    mockPipeline.exec.mockResolvedValue([
      [null, 0], // zremrangebyscore
      [null, 1], // zadd
      [null, 5], // zcard - 5 requests in window
      [null, 1], // expire
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('checkRateLimit', () => {
    it('allows requests under the limit', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 5], // 5 requests, under default limit of 100
        [null, 1],
      ]);

      const result = await checkRateLimit('test-key', RATE_LIMITS.default);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(95); // 100 - 5
      expect(result.retryAfter).toBeUndefined();
    });

    it('blocks requests over the limit', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 101], // Over limit (100 allowed, 101 blocked)
        [null, 1],
      ]);

      const result = await checkRateLimit('test-key', RATE_LIMITS.default);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(60);
    });

    it('blocks requests well over the limit', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 150], // Well over limit
        [null, 1],
      ]);

      const result = await checkRateLimit('test-key', RATE_LIMITS.default);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('uses auth rate limit for login attempts', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 5], // 5 requests
        [null, 1],
      ]);

      const result = await checkRateLimit('auth:login', RATE_LIMITS.auth);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // auth limit is 10
    });

    it('blocks auth after 10 attempts', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 11], // 11 requests, over auth limit of 10
        [null, 1],
      ]);

      const result = await checkRateLimit('auth:login', RATE_LIMITS.auth);

      expect(result.allowed).toBe(false);
    });

    it('fails closed in production on Redis error', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      mockPipeline.exec.mockRejectedValue(new Error('Redis connection failed'));

      const result = await checkRateLimit('test-key', {
        ...RATE_LIMITS.default,
        failClosed: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(60);
    });

    it('fails open in development on Redis error', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      mockPipeline.exec.mockRejectedValue(new Error('Redis connection failed'));

      const result = await checkRateLimit('test-key', {
        ...RATE_LIMITS.default,
        failClosed: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });

    it('returns correct reset time', async () => {
      const before = Date.now();

      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 5],
        [null, 1],
      ]);

      const result = await checkRateLimit('test-key', RATE_LIMITS.default);

      const after = Date.now();

      // Reset time should be ~60 seconds in the future
      expect(result.resetAt.getTime()).toBeGreaterThan(before);
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 60 * 1000 + 100);
    });
  });

  describe('getRateLimitKey', () => {
    it('uses API key prefix when present', () => {
      const mockRequest = {
        headers: { 'x-api-key': 'cwk_test1234567890abcdef' },
        user: undefined,
        ip: '127.0.0.1',
      } as unknown as FastifyRequest;

      const key = getRateLimitKey(mockRequest);

      expect(key).toBe('api:cwk_test12345678');
    });

    it('uses user ID when authenticated', () => {
      const mockRequest = {
        headers: {},
        user: { sub: 'user-123-456' },
        ip: '127.0.0.1',
      } as unknown as FastifyRequest;

      const key = getRateLimitKey(mockRequest);

      expect(key).toBe('user:user-123-456');
    });

    it('falls back to IP when no auth', () => {
      const mockRequest = {
        headers: {},
        user: undefined,
        ip: '192.168.1.100',
      } as unknown as FastifyRequest;

      const key = getRateLimitKey(mockRequest);

      expect(key).toBe('ip:192.168.1.100');
    });

    it('uses X-Forwarded-For when IP not available', () => {
      const mockRequest = {
        headers: { 'x-forwarded-for': '10.0.0.1' },
        user: undefined,
        ip: undefined,
      } as unknown as FastifyRequest;

      const key = getRateLimitKey(mockRequest);

      expect(key).toBe('ip:10.0.0.1');
    });
  });

  describe('createRateLimitHook', () => {
    it('sets rate limit headers on response', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 50],
        [null, 1],
      ]);

      const hook = createRateLimitHook(RATE_LIMITS.default);

      const mockRequest = {
        headers: {},
        user: { sub: 'user-123' },
        ip: '127.0.0.1',
      } as unknown as FastifyRequest;

      const headers: Record<string, unknown> = {};
      const mockReply = {
        header: vi.fn((name: string, value: unknown) => {
          headers[name] = value;
          return mockReply;
        }),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      await hook(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 50);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('returns 429 when rate limited', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 150], // Over limit
        [null, 1],
      ]);

      const hook = createRateLimitHook(RATE_LIMITS.default);

      const mockRequest = {
        headers: {},
        user: { sub: 'user-123' },
        ip: '127.0.0.1',
      } as unknown as FastifyRequest;

      const mockReply = {
        header: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      await hook(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(429);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests',
        })
      );
    });

    it('sets Retry-After header when rate limited', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 150],
        [null, 1],
      ]);

      const hook = createRateLimitHook(RATE_LIMITS.default);

      const mockRequest = {
        headers: {},
        user: { sub: 'user-123' },
        ip: '127.0.0.1',
      } as unknown as FastifyRequest;

      const headers: Record<string, unknown> = {};
      const mockReply = {
        header: vi.fn((name: string, value: unknown) => {
          headers[name] = value;
          return mockReply;
        }),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;

      await hook(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', 60);
    });
  });

  describe('RATE_LIMITS configuration', () => {
    it('has stricter limits for auth endpoints', () => {
      expect(RATE_LIMITS.auth.maxRequests).toBeLessThan(RATE_LIMITS.default.maxRequests);
      expect(RATE_LIMITS.auth.maxRequests).toBe(10);
    });

    it('has higher limits for API key access', () => {
      expect(RATE_LIMITS.api_key.maxRequests).toBeGreaterThan(RATE_LIMITS.default.maxRequests);
      expect(RATE_LIMITS.api_key.maxRequests).toBe(1000);
    });

    it('has reasonable limits for uploads', () => {
      expect(RATE_LIMITS.upload.maxRequests).toBe(20);
    });

    it('has reasonable limits for exports', () => {
      expect(RATE_LIMITS.export.maxRequests).toBe(10);
    });
  });
});

describe('Rate Limit Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents brute force login attacks', async () => {
    // Simulate 15 rapid login attempts
    const attempts: boolean[] = [];

    for (let i = 0; i < 15; i++) {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, i + 1], // Incrementing count
        [null, 1],
      ]);

      const result = await checkRateLimit('auth:attacker@evil.com', RATE_LIMITS.auth);
      attempts.push(result.allowed);
    }

    // First 10 should be allowed, rest should be blocked
    expect(attempts.slice(0, 10).every(a => a)).toBe(true);
    expect(attempts.slice(10).every(a => !a)).toBe(true);
  });

  it('isolates rate limits per user', async () => {
    // User 1's requests shouldn't affect User 2
    const user1Request = {
      headers: {},
      user: { sub: 'user-1' },
      ip: '127.0.0.1',
    } as unknown as FastifyRequest;

    const user2Request = {
      headers: {},
      user: { sub: 'user-2' },
      ip: '127.0.0.1',
    } as unknown as FastifyRequest;

    const key1 = getRateLimitKey(user1Request);
    const key2 = getRateLimitKey(user2Request);

    expect(key1).not.toBe(key2);
    expect(key1).toBe('user:user-1');
    expect(key2).toBe('user:user-2');
  });

  it('API keys have separate rate limit pool', async () => {
    const apiKeyRequest = {
      headers: { 'x-api-key': 'cwk_myapikey12345678' },
      user: undefined,
      ip: '127.0.0.1',
    } as unknown as FastifyRequest;

    const jwtRequest = {
      headers: {},
      user: { sub: 'user-123' },
      ip: '127.0.0.1',
    } as unknown as FastifyRequest;

    const apiKey = getRateLimitKey(apiKeyRequest);
    const jwtKey = getRateLimitKey(jwtRequest);

    expect(apiKey).not.toBe(jwtKey);
    expect(apiKey).toMatch(/^api:/);
    expect(jwtKey).toMatch(/^user:/);
  });
});
