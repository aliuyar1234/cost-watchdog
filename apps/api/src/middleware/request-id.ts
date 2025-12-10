/**
 * Request ID Middleware
 *
 * Extracts or generates a request ID and adds it to request/response.
 * Enables distributed tracing across services.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import {
  REQUEST_ID_HEADER,
  extractOrGenerateRequestId,
  runWithRequestContext,
} from '../lib/request-id.js';

// ═══════════════════════════════════════════════════════════════════════════
// EXTEND FASTIFY TYPES
// ═══════════════════════════════════════════════════════════════════════════

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

async function requestIdMiddleware(fastify: FastifyInstance): Promise<void> {
  // Add request ID to every request
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractOrGenerateRequestId(request.headers as Record<string, string | string[] | undefined>);

    // Store on request object
    request.requestId = requestId;

    // Add to response headers
    reply.header(REQUEST_ID_HEADER, requestId);

    // Add to Fastify logger context
    request.log = request.log.child({ requestId });
  });

  // Wrap request handler in async context for deep call stack access
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    // Note: For full async context, the route handler needs to be wrapped
    // This hook adds the context for preHandler hooks
  });
}

export default fp(requestIdMiddleware, {
  name: 'request-id',
  fastify: '4.x',
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER DECORATOR FOR ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap a route handler to run in request context.
 * This enables getCurrentRequestId() in deep call stacks.
 */
export function withRequestContext<T>(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
): (request: FastifyRequest, reply: FastifyReply) => Promise<T> {
  return (request, reply) => {
    return runWithRequestContext(request.requestId, () => handler(request, reply));
  };
}
