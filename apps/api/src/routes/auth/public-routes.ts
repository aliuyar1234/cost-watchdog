import type { FastifyInstance } from 'fastify';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RefreshTokenInput,
  type RegisterInput,
} from '../../lib/auth.js';
import { rateLimitEndpoint } from '../../lib/rate-limit.js';
import { authService } from '../../services/auth.service.js';
import { getAuthContext, setAuthCookies, shouldReturnTokens, clearAuthCookies } from './shared.js';

export async function registerAuthPublicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RegisterInput }>(
    '/register',
    {
      preHandler: [rateLimitEndpoint('auth')],
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
          getAuthContext(request),
          request.log,
        );

        if (!result.success) {
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
            details: result.details,
          });
        }

        setAuthCookies(reply, result.accessToken, result.refreshToken);

        const response: Record<string, unknown> = { user: result.user };
        if (shouldReturnTokens(request)) {
          response['accessToken'] = result.accessToken;
          response['refreshToken'] = result.refreshToken;
        }

        return reply.code(201).send(response);
      } catch (cause) {
        request.log.error(cause, 'Registration failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create account',
        });
      }
    },
  );

  fastify.post<{ Body: LoginInput }>(
    '/login',
    {
      preHandler: [rateLimitEndpoint('auth')],
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
          getAuthContext(request),
          request.log,
        );

        if (!result.success) {
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
            retryAfter: result.retryAfter,
          });
        }

        setAuthCookies(reply, result.accessToken, result.refreshToken);

        const response: Record<string, unknown> = { user: result.user };
        if (shouldReturnTokens(request)) {
          response['accessToken'] = result.accessToken;
          response['refreshToken'] = result.refreshToken;
        }

        return reply.send(response);
      } catch (cause) {
        request.log.error(cause, 'Login failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Login failed',
        });
      }
    },
  );

  fastify.post<{ Body: RefreshTokenInput }>(
    '/refresh',
    {
      preHandler: [rateLimitEndpoint('auth')],
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
          getAuthContext(request),
          request.log,
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

        const response: Record<string, unknown> = { sessionId: result.sessionId };
        if (shouldReturnTokens(request)) {
          response['accessToken'] = result.accessToken;
          response['refreshToken'] = result.refreshToken;
        }

        return reply.send(response);
      } catch (cause) {
        request.log.error(cause, 'Token refresh failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Token refresh failed',
        });
      }
    },
  );

  fastify.post<{ Body: { email: string } }>(
    '/forgot-password',
    {
      preHandler: [rateLimitEndpoint('auth')],
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
          getAuthContext(request),
          request.log,
        );

        if (!result.success) {
          return reply.code(result.statusCode).send({
            error: result.error,
            message: result.message,
            retryAfter: result.retryAfter,
          });
        }

        if (result.token && process.env['NODE_ENV'] !== 'production') {
          request.log.info(
            { resetToken: result.token },
            'Password reset token generated (dev only)',
          );
        }

        return reply.send({
          success: true,
          message: result.message,
        });
      } catch (cause) {
        request.log.error(cause, 'Password reset request failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process password reset request',
        });
      }
    },
  );

  fastify.post<{ Body: { token: string; newPassword: string } }>(
    '/reset-password',
    {
      preHandler: [rateLimitEndpoint('auth')],
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
          getAuthContext(request),
          request.log,
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
      } catch (cause) {
        request.log.error(cause, 'Password reset failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to reset password',
        });
      }
    },
  );
}
