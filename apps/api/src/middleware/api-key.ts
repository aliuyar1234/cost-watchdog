import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { prisma } from '../lib/db.js';

/**
 * Valid API key scopes.
 */
export const API_KEY_SCOPES = [
  'read:anomalies',
  'write:anomalies',
  'read:analytics',
  'read:alerts',
  'write:alerts',
  'read:documents',
  'write:documents',
  'read:exports',
  'read:users',
  'write:users',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// Store API key scopes on the request for later scope checking
declare module 'fastify' {
  interface FastifyRequest {
    apiKeyScopes?: string[];
  }
}

/**
 * API key authentication middleware.
 * Validates API key from X-API-Key header.
 */
export async function validateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

  if (!apiKeyHeader) {
    return; // No API key provided, continue with JWT auth
  }

  // Hash the provided key
  const keyHash = createHash('sha256').update(apiKeyHeader).digest('hex');

  // Look up the API key
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (!apiKey) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired API key',
    });
  }

  // Update last used timestamp (fire and forget)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch((err: Error) => {
    console.error('[ApiKey] Failed to update lastUsedAt:', err);
  });

  // Set request.user with API key info
  // Note: Single-tenant system - no tenantId needed
  request.user = {
    sub: apiKey.createdById,
    email: `api-key:${apiKey.name}`,
    role: 'api', // Special role for API keys
  };

  // Store scopes for later checking
  request.apiKeyScopes = apiKey.scopes;
}

/**
 * Check if request has required scope.
 * Returns 403 Forbidden if scope is missing.
 */
export function requireScope(scope: ApiKeyScope) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // If authenticated via API key, check scopes
    if (user.role === 'api') {
      const scopes = request.apiKeyScopes || [];
      if (!scopes.includes(scope)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: `API key missing required scope: ${scope}`,
        });
      }
    }

    // JWT-authenticated users (non-API) have access based on their role
    // Role-based access is handled by requireRole middleware
  };
}
