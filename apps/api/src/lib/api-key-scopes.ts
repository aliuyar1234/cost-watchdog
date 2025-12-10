/**
 * API Key Scope Enforcement Library
 *
 * Provides scope checking utilities for API key authenticated requests.
 * Ensures API keys can only perform actions allowed by their scopes.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { logAuditEvent } from './audit.js';
import { getAuditContext } from '../middleware/request-context.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * All valid API key scopes.
 */
export const API_KEY_SCOPES = [
  // Anomalies
  'read:anomalies',
  'write:anomalies',
  // Analytics
  'read:analytics',
  // Alerts
  'read:alerts',
  'write:alerts',
  // Documents
  'read:documents',
  'write:documents',
  // Exports
  'read:exports',
  // Users
  'read:users',
  'write:users',
  // Cost Records
  'read:cost_records',
  'write:cost_records',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/**
 * Scope check result.
 */
export interface ScopeCheckResult {
  allowed: boolean;
  missingScope?: ApiKeyScope;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a request has the required scope.
 * Returns true for non-API-key authenticated requests (JWT users have role-based access).
 */
export function hasScope(request: FastifyRequest, scope: ApiKeyScope): boolean {
  const user = request.user;

  // Not authenticated
  if (!user) {
    return false;
  }

  // JWT-authenticated users have access based on their role (not scopes)
  if (user.role !== 'api') {
    return true;
  }

  // API key authenticated - check scopes
  const scopes = request.apiKeyScopes || [];
  return scopes.includes(scope);
}

/**
 * Check if a request has ALL of the required scopes.
 */
export function hasAllScopes(request: FastifyRequest, requiredScopes: ApiKeyScope[]): ScopeCheckResult {
  const user = request.user;

  if (!user) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  // JWT users have role-based access
  if (user.role !== 'api') {
    return { allowed: true };
  }

  const scopes = request.apiKeyScopes || [];
  for (const scope of requiredScopes) {
    if (!scopes.includes(scope)) {
      return { allowed: false, missingScope: scope };
    }
  }

  return { allowed: true };
}

/**
 * Check if a request has ANY of the required scopes.
 */
export function hasAnyScope(request: FastifyRequest, requiredScopes: ApiKeyScope[]): ScopeCheckResult {
  const user = request.user;

  if (!user) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  // JWT users have role-based access
  if (user.role !== 'api') {
    return { allowed: true };
  }

  const scopes = request.apiKeyScopes || [];
  for (const scope of requiredScopes) {
    if (scopes.includes(scope)) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `API key requires one of: ${requiredScopes.join(', ')}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a middleware that enforces a required scope.
 * Logs scope violations to the audit log.
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

    // JWT-authenticated users have access based on their role
    if (user.role !== 'api') {
      return;
    }

    // API key authenticated - check scopes
    const scopes = request.apiKeyScopes || [];
    if (!scopes.includes(scope)) {
      // Log scope violation
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'api_key',
        entityId: user.sub,
        action: 'verify',
        metadata: {
          scopeViolation: true,
          requiredScope: scope,
          providedScopes: scopes,
          endpoint: `${request.method} ${request.url}`,
        },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log scope violation'));

      return reply.status(403).send({
        error: 'Forbidden',
        message: `API key missing required scope: ${scope}`,
      });
    }
  };
}

/**
 * Create a middleware that enforces ALL required scopes.
 */
export function requireAllScopes(scopes: ApiKeyScope[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // JWT-authenticated users have access based on their role
    if (user.role !== 'api') {
      return;
    }

    const result = hasAllScopes(request, scopes);
    if (!result.allowed) {
      // Log scope violation
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'api_key',
        entityId: user.sub,
        action: 'verify',
        metadata: {
          scopeViolation: true,
          requiredScopes: scopes,
          missingScope: result.missingScope,
          providedScopes: request.apiKeyScopes,
          endpoint: `${request.method} ${request.url}`,
        },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log scope violation'));

      return reply.status(403).send({
        error: 'Forbidden',
        message: result.missingScope
          ? `API key missing required scope: ${result.missingScope}`
          : 'API key missing required scopes',
      });
    }
  };
}

/**
 * Create a middleware that enforces ANY of the required scopes.
 */
export function requireAnyScope(scopes: ApiKeyScope[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // JWT-authenticated users have access based on their role
    if (user.role !== 'api') {
      return;
    }

    const result = hasAnyScope(request, scopes);
    if (!result.allowed) {
      // Log scope violation
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'api_key',
        entityId: user.sub,
        action: 'verify',
        metadata: {
          scopeViolation: true,
          requiredScopes: scopes,
          providedScopes: request.apiKeyScopes,
          endpoint: `${request.method} ${request.url}`,
        },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log scope violation'));

      return reply.status(403).send({
        error: 'Forbidden',
        message: result.reason || `API key requires one of: ${scopes.join(', ')}`,
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE DECORATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map HTTP method to scope type (read or write).
 */
export function methodToScopeType(method: string): 'read' | 'write' {
  const readMethods = ['GET', 'HEAD', 'OPTIONS'];
  return readMethods.includes(method.toUpperCase()) ? 'read' : 'write';
}

/**
 * Generate scope from resource and method.
 * Example: ('anomalies', 'POST') => 'write:anomalies'
 */
export function generateScope(resource: string, method: string): ApiKeyScope {
  const type = methodToScopeType(method);
  return `${type}:${resource}` as ApiKeyScope;
}
