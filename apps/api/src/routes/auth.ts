/**
 * Auth Routes
 *
 * HTTP layer for authentication endpoints.
 * Business logic is delegated to AuthService.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db.js';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
  type RefreshTokenInput,
} from '../lib/auth.js';
import { authenticate, extractToken } from '../middleware/auth.js';
import { getAuditContext } from '../middleware/request-context.js';
import { authService, type AuthContext } from '../services/auth.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? 'strict' as const : 'lax' as const,
  path: '/',
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
): void {
  reply.setCookie('accessToken', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60,
  });
  reply.setCookie('refreshToken', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60,
  });
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('accessToken', COOKIE_OPTIONS);
  reply.clearCookie('refreshToken', COOKIE_OPTIONS);
}

function getContext(request: FastifyRequest): AuthContext {
  const ctx = getAuditContext(request);
  return {
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress || request.ip,
    userAgent: ctx.userAgent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/register
   */
  fastify.post<{ Body: RegisterInput }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'firstName', 'lastName'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const parseResult = registerSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        });
      }

      try {
        const result = await authService.register(
          parseResult.data,
          getContext(request),
          request.log
        );

        if (!result.success) {
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
            details: result.details,
          });
        }

        setAuthCookies(reply, result.accessToken, result.refreshToken);

        return reply.code(201).send({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      } catch (error) {
        request.log.error(error, 'Registration failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create account',
        });
      }
    }
  );

  /**
   * POST /auth/login
   */
  fastify.post<{ Body: LoginInput }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      const parseResult = loginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        });
      }

      try {
        const result = await authService.login(
          parseResult.data,
          getContext(request),
          request.log
        );

        if (!result.success) {
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
            retryAfter: result.retryAfter,
          });
        }

        setAuthCookies(reply, result.accessToken, result.refreshToken);

        return reply.send({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      } catch (error) {
        request.log.error(error, 'Login failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Login failed',
        });
      }
    }
  );

  /**
   * POST /auth/refresh
   */
  fastify.post<{ Body: RefreshTokenInput }>(
    '/refresh',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            refreshToken: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies['refreshToken'] || request.body?.refreshToken;

      if (!refreshToken) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: 'Refresh token required',
        });
      }

      try {
        const result = await authService.refresh(
          refreshToken,
          getContext(request),
          request.log
        );

        if (!result.success) {
          if (result.securityEvent) {
            clearAuthCookies(reply);
          }
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
            securityEvent: result.securityEvent,
          });
        }

        setAuthCookies(reply, result.accessToken, result.refreshToken);

        return reply.send({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          sessionId: result.sessionId,
        });
      } catch (error) {
        request.log.error(error, 'Token refresh failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Token refresh failed',
        });
      }
    }
  );

  /**
   * GET /auth/me
   */
  fastify.get(
    '/me',
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Not authenticated',
        });
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            avatarUrl: true,
            permissions: true,
            allowedLocationIds: true,
            allowedCostCenterIds: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });

        if (!user) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'User not found',
          });
        }

        const settings = await prisma.appSettings.findFirst();

        return reply.send({
          user,
          app: settings ? { name: settings.name, plan: settings.plan } : null,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get user info');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user info',
        });
      }
    }
  );

  /**
   * POST /auth/forgot-password
   */
  fastify.post<{ Body: { email: string } }>(
    '/forgot-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await authService.requestPasswordReset(
          request.body.email,
          getContext(request),
          request.log
        );

        if (!result.success) {
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
            retryAfter: result.retryAfter,
          });
        }

        if (result.token && process.env['NODE_ENV'] !== 'production') {
          request.log.info({ resetToken: result.token }, 'Password reset token generated (dev only)');
        }

        return reply.send({
          success: true,
          message: result.message,
        });
      } catch (error) {
        request.log.error(error, 'Password reset request failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process password reset request',
        });
      }
    }
  );

  /**
   * POST /auth/reset-password
   */
  fastify.post<{ Body: { token: string; newPassword: string } }>(
    '/reset-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string', minLength: 1 },
            newPassword: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await authService.resetPassword(
          request.body.token,
          request.body.newPassword,
          getContext(request),
          request.log
        );

        if (!result.success) {
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
          });
        }

        return reply.send({
          success: true,
          message: result.message,
        });
      } catch (error) {
        request.log.error(error, 'Password reset failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to reset password',
        });
      }
    }
  );

  /**
   * POST /auth/logout
   */
  fastify.post(
    '/logout',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        await authService.logout(
          request.user?.sub,
          request.user?.jti,
          extractToken(request) ?? undefined,
          request.cookies?.['refreshToken'] ?? undefined,
          getContext(request),
          request.log
        );

        clearAuthCookies(reply);

        return reply.send({
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        request.log.error(error, 'Logout failed');
        clearAuthCookies(reply);
        return reply.send({
          success: true,
          message: 'Logged out successfully',
        });
      }
    }
  );
}
