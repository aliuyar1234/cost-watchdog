/**
 * Request Context Middleware
 *
 * Captures and propagates request metadata for audit logging:
 * - Request ID (generated or propagated from X-Request-ID header)
 * - Client IP address
 * - User agent
 *
 * This middleware should be registered before all routes.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RequestContextData {
  requestId: string;
  ipAddress: string;
  userAgent: string | null;
}

// Extend FastifyRequest to include request context
declare module 'fastify' {
  interface FastifyRequest {
    requestContext: RequestContextData;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract client IP address from request.
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) when behind a reverse proxy.
 */
function getClientIp(request: FastifyRequest): string {
  // X-Forwarded-For may contain multiple IPs: client, proxy1, proxy2...
  // The first IP is the original client
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const clientIp = ips?.split(',')[0]?.trim();
    if (clientIp) return clientIp;
  }

  // X-Real-IP is set by some proxies (nginx)
  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    const ip = Array.isArray(realIp) ? realIp[0] : realIp;
    if (ip) return ip;
  }

  // Fall back to direct connection IP
  return request.ip || 'unknown';
}

/**
 * Extract or generate request ID.
 * Propagates existing X-Request-ID for distributed tracing.
 */
function getRequestId(request: FastifyRequest): string {
  const existingId = request.headers['x-request-id'];
  if (existingId) {
    const id = Array.isArray(existingId) ? existingId[0] : existingId;
    if (id) return id;
  }
  return randomUUID();
}

/**
 * Extract user agent string.
 */
function getUserAgent(request: FastifyRequest): string | null {
  const userAgent = request.headers['user-agent'];
  if (!userAgent) return null;
  return Array.isArray(userAgent) ? userAgent[0] : userAgent;
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

async function requestContextPlugin(fastify: FastifyInstance): Promise<void> {
  // Decorate request with context
  fastify.decorateRequest('requestContext', null);

  // Add hook to populate context on each request
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = getRequestId(request);
    const ipAddress = getClientIp(request);
    const userAgent = getUserAgent(request);

    // Attach context to request
    request.requestContext = {
      requestId,
      ipAddress,
      userAgent,
    };

    // Set X-Request-ID header on response for correlation
    reply.header('X-Request-ID', requestId);
  });
}

export default fp(requestContextPlugin, {
  name: 'request-context',
  fastify: '4.x',
});

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTION FOR GETTING CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get request context for audit logging.
 * Returns a partial context if request is not available (e.g., background jobs).
 */
export function getAuditContext(request?: FastifyRequest): RequestContextData {
  if (!request?.requestContext) {
    return {
      requestId: randomUUID(),
      ipAddress: 'system',
      userAgent: null,
    };
  }

  return request.requestContext;
}
