import type { FastifyRequest, FastifyReply, FastifyInstance, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken, type AuthPayload } from '../lib/auth.js';
import { isTokenBlacklisted } from '../lib/redis.js';

/**
 * Extend FastifyRequest to include authenticated user data.
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthPayload;
  }
}

/**
 * Extract Bearer token from Authorization header or cookies.
 *
 * @param request - Fastify request object
 * @returns Token string or null if not present
 */
export function extractToken(request: FastifyRequest): string | null {
  // Try Authorization header first
  const authHeader = request.headers.authorization;
  if (authHeader) {
    const [type, token] = authHeader.split(' ');
    if (type?.toLowerCase() === 'bearer' && token) {
      return token;
    }
  }

  // Fall back to cookie
  const cookieToken = request.cookies?.['accessToken'];
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

/**
 * Authentication hook that validates JWT tokens.
 * Attaches user payload to request.user if valid.
 * Also checks if the token has been blacklisted (e.g., after logout).
 *
 * @param request - Fastify request
 * @param reply - Fastify reply
 */
export const authenticate: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const token = extractToken(request);

  if (!token) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization',
    });
    return;
  }

  // Check if token has been blacklisted (e.g., after logout)
  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Token has been invalidated',
    });
    return;
  }

  const payload = await verifyToken(token);

  if (!payload) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
    return;
  }

  request.user = payload;
};

/**
 * Optional authentication hook.
 * Attaches user if token present and valid, but doesn't reject if missing.
 *
 * @param request - Fastify request
 */
export const optionalAuthenticate: preHandlerHookHandler = async (
  request: FastifyRequest
): Promise<void> => {
  const token = extractToken(request);

  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      request.user = payload;
    }
  }
};

/**
 * Role-based authorization hook factory.
 * Creates a hook that checks if user has required role.
 *
 * @param allowedRoles - Array of roles that can access the route
 * @returns PreHandler hook function
 */
export function requireRole(...allowedRoles: string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      return;
    }
  };
}

/**
 * Fastify plugin to register authentication decorator.
 * Adds the authenticate hook as a decorator for easy reuse.
 */
async function authPlugin(fastify: FastifyInstance): Promise<void> {
  // Decorate request with user property
  fastify.decorateRequest('user', null);

  // Add auth hooks as decorators
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('optionalAuthenticate', optionalAuthenticate);
  fastify.decorate('requireRole', requireRole);
}

export default fp(authPlugin, {
  name: 'auth',
});
