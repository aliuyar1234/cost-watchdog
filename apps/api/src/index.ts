import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { checkDatabaseHealth, disconnectDatabase } from './lib/db.js';
import authPlugin from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import anomalyRoutes from './routes/anomalies.js';
import alertRoutes from './routes/alerts.js';
import analyticsRoutes from './routes/analytics.js';
import exportRoutes from './routes/exports.js';
import userRoutes from './routes/users.js';
import apiKeyRoutes from './routes/api-keys.js';
import { validateApiKey } from './middleware/api-key.js';
import { createRateLimitHook, RATE_LIMITS } from './lib/rate-limit.js';
import { registerOpenApi } from './lib/openapi.js';

const fastify = Fastify({
  logger: true,
});

// Register CORS
await fastify.register(cors, {
  origin: process.env['WEB_URL'] || 'http://localhost:3000',
  credentials: true,
});

// Register cookie plugin for HttpOnly auth cookies
await fastify.register(cookie, {
  secret: process.env['COOKIE_SECRET'] || process.env['AUTH_SECRET'] || 'dev-cookie-secret-32-chars-min',
  parseOptions: {},
});

// Register multipart for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
});

// Register authentication plugin
await fastify.register(authPlugin);

// Add API key validation hook
fastify.addHook('preHandler', validateApiKey);

// Add rate limiting hook
fastify.addHook('preHandler', createRateLimitHook(RATE_LIMITS.default));

// Health check endpoint
fastify.get('/health', async () => {
  const dbHealthy = await checkDatabaseHealth();
  return {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'up' : 'down',
    },
  };
});

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

    // API key management routes
    await app.register(apiKeyRoutes, { prefix: '/api-keys' });

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
