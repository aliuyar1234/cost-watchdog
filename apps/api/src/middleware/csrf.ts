/**
 * CSRF Protection Middleware
 *
 * Implements double-submit cookie pattern for state-changing requests.
 * Skips validation for API key authenticated requests.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateSignedCsrfToken,
  validateCsrfToken,
  requiresCsrfProtection,
  getCsrfCookieOptions,
} from '../lib/csrf.js';

// ═══════════════════════════════════════════════════════════════════════════
// EXTEND FASTIFY TYPES
// ═══════════════════════════════════════════════════════════════════════════

declare module 'fastify' {
  interface FastifyRequest {
    csrfToken?: string;
    isApiKeyAuth?: boolean;
  }

  interface FastifyReply {
    generateCsrfToken: () => string;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CsrfOptions {
  /**
   * Secret for signing CSRF tokens.
   * Defaults to AUTH_SECRET environment variable.
   */
  secret?: string;

  /**
   * Paths to skip CSRF validation.
   * Useful for webhooks or API endpoints.
   */
  ignorePaths?: string[];

  /**
   * Whether to skip CSRF for API key authenticated requests.
   * Default: true
   */
  skipForApiKey?: boolean;

  /**
   * Cookie options override.
   */
  cookieOptions?: {
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

async function csrfMiddleware(
  fastify: FastifyInstance,
  options: CsrfOptions = {}
): Promise<void> {
  const secret = options.secret || process.env['AUTH_SECRET'];
  if (!secret) {
    throw new Error('CSRF middleware requires a secret (AUTH_SECRET or options.secret)');
  }

  const ignorePaths = options.ignorePaths || [];
  const skipForApiKey = options.skipForApiKey !== false;

  // Add helper to generate CSRF token
  fastify.decorateReply('generateCsrfToken', function (this: FastifyReply) {
    const token = generateSignedCsrfToken(secret);
    const cookieOpts = getCsrfCookieOptions();

    if (options.cookieOptions?.secure !== undefined) {
      cookieOpts.secure = options.cookieOptions.secure;
    }
    if (options.cookieOptions?.sameSite) {
      cookieOpts.sameSite = options.cookieOptions.sameSite;
    }

    this.setCookie(CSRF_COOKIE_NAME, token, cookieOpts);
    return token;
  });

  // Validate CSRF on state-changing requests
  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip for safe methods
      if (!requiresCsrfProtection(request.method)) {
        return;
      }

      // Skip for ignored paths
      const path = request.url.split('?')[0] || '';
      if (ignorePaths.some((p) => path.startsWith(p))) {
        return;
      }

      // Skip for API key authenticated requests
      if (skipForApiKey && request.isApiKeyAuth) {
        return;
      }

      // Get tokens
      const cookieToken = request.cookies?.[CSRF_COOKIE_NAME];
      const headerToken = request.headers[CSRF_HEADER_NAME] as string | undefined;

      // Validate
      const result = validateCsrfToken(cookieToken, headerToken, secret);

      if (!result.valid) {
        request.log.warn({ reason: result.reason }, 'CSRF validation failed');
        return reply.code(403).send({
          error: 'Forbidden',
          message: result.reason || 'CSRF validation failed',
        });
      }
    }
  );
}

export default fp(csrfMiddleware, {
  name: 'csrf',
  fastify: '4.x',
  dependencies: ['@fastify/cookie'],
});

// ═══════════════════════════════════════════════════════════════════════════
// CSRF ROUTES PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CSRF routes plugin - provides endpoint to get a new CSRF token.
 */
export async function csrfRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /csrf/token
   * Returns a new CSRF token and sets it as a cookie.
   */
  fastify.get('/token', async (request, reply) => {
    const token = reply.generateCsrfToken();
    return { token };
  });
}
