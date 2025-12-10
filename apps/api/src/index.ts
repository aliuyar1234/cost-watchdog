import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { checkDatabaseHealth, disconnectDatabase } from './lib/db.js';
import requestContextPlugin from './middleware/request-context.js';
import authPlugin from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import anomalyRoutes from './routes/anomalies.js';
import alertRoutes from './routes/alerts.js';
import analyticsRoutes from './routes/analytics.js';
import exportRoutes from './routes/exports.js';
import userRoutes from './routes/users.js';
import apiKeyRoutes from './routes/api-keys.js';
import auditLogRoutes from './routes/audit-logs.js';
import metricsRoutes from './routes/metrics.js';
import sessionRoutes from './routes/sessions.js';
import mfaRoutes from './routes/mfa.js';
import { validateApiKey } from './middleware/api-key.js';
import { recordHttpRequest } from './lib/metrics.js';
import { createRateLimitHook, RATE_LIMITS } from './lib/rate-limit.js';
import { registerOpenApi } from './lib/openapi.js';
import { secrets } from './lib/secrets.js';
import csrfMiddleware, { csrfRoutes } from './middleware/csrf.js';
import { initializeFromEnv as initializeFieldEncryption } from './lib/field-encryption.js';
import { getSecureLoggerConfig } from './middleware/secure-logging.js';

/**
 * Environment validation for security-critical configuration.
 * Reads from Docker secrets first, falls back to environment variables.
 */
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const COOKIE_SECRET = process.env['COOKIE_SECRET'] || secrets.getAuthSecret();

// Validate cookie secret in production - REQUIRED for session security
if (IS_PRODUCTION && !COOKIE_SECRET) {
  throw new Error('FATAL: COOKIE_SECRET or AUTH_SECRET is required in production');
}
if (IS_PRODUCTION && COOKIE_SECRET && COOKIE_SECRET.length < 32) {
  throw new Error('FATAL: COOKIE_SECRET must be at least 32 characters long');
}

// Initialize field encryption (required for MFA and sensitive data)
try {
  initializeFieldEncryption();
} catch (err) {
  if (IS_PRODUCTION) {
    throw err; // Fatal in production
  }
  console.warn('[Encryption] Field encryption not configured, using fallback. Set FIELD_ENCRYPTION_KEY for production.');
}

// Get secure logger configuration (redacts sensitive data like passwords, tokens, etc.)
const secureLoggerConfig = getSecureLoggerConfig();

const fastify = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] || (IS_PRODUCTION ? 'info' : 'debug'),
    // Use secure serializers that redact sensitive data
    // Type assertion needed because Fastify's serializer types are stricter than our custom serializers
    serializers: {
      ...secureLoggerConfig.serializers,
      // Extend request serializer to include request ID
      req(request: {
        method?: string;
        url?: string;
        headers?: Record<string, string | string[] | undefined>;
        requestContext?: { requestId: string };
      }) {
        const baseReq = secureLoggerConfig.serializers.req(request);
        return {
          ...baseReq,
          requestId: request.requestContext?.requestId,
        };
      },
    } as Record<string, (arg: unknown) => unknown>,
  },
  // Trust proxy headers when behind a reverse proxy (needed for rate limiting)
  trustProxy: IS_PRODUCTION,
  // Generate request IDs via the request-context middleware
  genReqId: () => '',
});

// Register security headers with helmet
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some API responses
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow CORS
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
});

// Register CORS
await fastify.register(cors, {
  origin: process.env['WEB_URL'] || 'http://localhost:3000',
  credentials: true,
});

// Register cookie plugin for HttpOnly auth cookies
await fastify.register(cookie, {
  // In development, allow a default secret; in production, require explicit config
  secret: COOKIE_SECRET || 'dev-cookie-secret-32-chars-min-only-for-local',
  parseOptions: {},
});

// Register multipart for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
});

// Register request context middleware (must be before auth for audit logging)
await fastify.register(requestContextPlugin);

// Register CSRF protection middleware
// Skips API key authenticated requests and safe methods (GET/HEAD/OPTIONS)
await fastify.register(csrfMiddleware, {
  ignorePaths: ['/health', '/metrics', '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password'],
  skipForApiKey: true,
});

// Register authentication plugin
await fastify.register(authPlugin);

// Add API key validation hook
fastify.addHook('preHandler', validateApiKey);

// Add rate limiting hook
fastify.addHook('preHandler', createRateLimitHook(RATE_LIMITS.default));

// Add metrics collection hook
fastify.addHook('onResponse', async (request, reply) => {
  const startTime = request.requestContext?.requestId
    ? Date.now() - (request as { startTime?: number }).startTime!
    : 0;

  // Skip metrics endpoint to avoid recursion
  if (request.url === '/metrics') return;

  recordHttpRequest(
    request.method,
    request.url,
    reply.statusCode,
    startTime,
    request.headers['content-length'] ? parseInt(request.headers['content-length'] as string, 10) : undefined
  );
});

// Store request start time
fastify.addHook('onRequest', async (request) => {
  (request as { startTime?: number }).startTime = Date.now();
});

// Health check endpoint - minimal info in production to prevent information leakage
fastify.get('/health', async (request, reply) => {
  const dbHealthy = await checkDatabaseHealth();
  const isHealthy = dbHealthy;

  // In production, only return minimal status to prevent information disclosure
  if (IS_PRODUCTION) {
    // Return appropriate status code based on health
    reply.code(isHealthy ? 200 : 503);
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
    };
  }

  // In development, return more detailed info for debugging
  reply.code(isHealthy ? 200 : 503);
  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'up' : 'down',
    },
  };
});

// Detailed health check for authenticated admins
fastify.get('/health/detailed', {
  preHandler: [
    async (request, reply) => {
      // Check if user is authenticated and is admin
      if (!request.user || request.user.role !== 'admin') {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    },
  ],
}, async (request, reply) => {
  const dbHealthy = await checkDatabaseHealth();

  // Check Redis health
  let redisHealthy = false;
  try {
    const { redis } = await import('./lib/redis.js');
    await redis.ping();
    redisHealthy = true;
  } catch {
    redisHealthy = false;
  }

  const allHealthy = dbHealthy && redisHealthy;

  reply.code(allHealthy ? 200 : 503);
  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbHealthy ? 'up' : 'down',
      },
      redis: {
        status: redisHealthy ? 'up' : 'down',
      },
    },
  };
});

// Prometheus metrics endpoint (unauthenticated, protect at network level)
await fastify.register(metricsRoutes, { prefix: '/metrics' });

// API version prefix
fastify.register(
  async (app) => {
    app.get('/', async () => {
      return {
        name: 'Cost Watchdog API',
        version: '0.1.0',
      };
    });

    // Auth routes
    await app.register(authRoutes, { prefix: '/auth' });

    // CSRF token endpoint
    await app.register(csrfRoutes, { prefix: '/csrf' });

    // Document routes
    await app.register(documentRoutes, { prefix: '/documents' });

    // Anomaly routes
    await app.register(anomalyRoutes, { prefix: '/anomalies' });

    // Alert routes
    await app.register(alertRoutes, { prefix: '/alerts' });

    // Analytics routes
    await app.register(analyticsRoutes, { prefix: '/analytics' });

    // Export routes
    await app.register(exportRoutes, { prefix: '/exports' });

    // User management routes
    await app.register(userRoutes, { prefix: '/users' });

    // Session management routes (nested under users)
    await app.register(sessionRoutes, { prefix: '/users' });

    // API key management routes
    await app.register(apiKeyRoutes, { prefix: '/api-keys' });

    // Audit log routes (admin/auditor only)
    await app.register(auditLogRoutes, { prefix: '/audit-logs' });

    // MFA routes
    await app.register(mfaRoutes, { prefix: '/mfa' });

    // Register OpenAPI documentation routes
    await registerOpenApi(app);
  },
  { prefix: '/api/v1' }
);

// Graceful shutdown
const shutdown = async () => {
  fastify.log.info('Shutting down...');
  await fastify.close();
  await disconnectDatabase();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env['PORT'] || '3001', 10);
    const host = process.env['HOST'] || '0.0.0.0';

    await fastify.listen({ port, host });
    fastify.log.info(`Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
