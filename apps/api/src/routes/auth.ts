import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db.js';
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
  verifyRefreshToken,
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  type LoginInput,
  type RegisterInput,
  type RefreshTokenInput,
} from '../lib/auth.js';
import { authenticate } from '../middleware/auth.js';

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? 'strict' as const : 'lax' as const,
  path: '/',
};

/**
 * Set auth cookies on reply.
 */
function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
): void {
  reply.setCookie('accessToken', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60, // 15 minutes
  });
  reply.setCookie('refreshToken', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clear auth cookies on reply.
 */
function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('accessToken', COOKIE_OPTIONS);
  reply.clearCookie('refreshToken', COOKIE_OPTIONS);
}

/**
 * Auth routes plugin.
 * Provides login, register, refresh, and logout endpoints.
 * Single-tenant: No tenant creation, users are created directly.
 */
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/register
   * Register a new user.
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
    async (request: FastifyRequest<{ Body: RegisterInput }>, reply: FastifyReply) => {
      // Validate request body
      const parseResult = registerSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        });
      }

      const { email, password, firstName, lastName } = parseResult.data;

      try {
        // Check if user with this email exists
        const existingUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (existingUser) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'User with this email already exists',
          });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Determine role - first user becomes admin
        const userCount = await prisma.user.count();
        const role = userCount === 0 ? 'admin' : 'viewer';

        // Create user
        const user = await prisma.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash,
            firstName,
            lastName,
            role,
            permissions: [],
            isActive: true,
          },
        });

        // Generate tokens
        const tokens = await generateTokenPair({
          id: user.id,
          email: user.email,
          role: user.role,
        });

        // Set HttpOnly cookies
        setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

        return reply.code(201).send({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
          // Also return tokens in response body for backwards compatibility
          ...tokens,
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
   * Authenticate user and return tokens.
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
    async (request: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) => {
      // Validate request body
      const parseResult = loginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        });
      }

      const { email, password } = parseResult.data;

      try {
        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.isActive || !user.passwordHash) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid email or password',
          });
        }

        // Verify password
        const isValid = await verifyPassword(user.passwordHash, password);
        if (!isValid) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid email or password',
          });
        }

        // Update last login timestamp (fire and forget)
        prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch((err) => request.log.error(err, 'Failed to update last login'));

        // Generate tokens
        const tokens = await generateTokenPair({
          id: user.id,
          email: user.email,
          role: user.role,
        });

        // Set HttpOnly cookies
        setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

        return reply.send({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
          // Also return tokens in response body for backwards compatibility
          ...tokens,
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
   * Exchange refresh token for new access token.
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
    async (request: FastifyRequest<{ Body: RefreshTokenInput }>, reply: FastifyReply) => {
      // Try cookie first, then body
      const refreshToken = request.cookies['refreshToken'] || request.body?.refreshToken;

      if (!refreshToken) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: 'Refresh token required',
        });
      }

      try {
        // Verify refresh token
        const userId = await verifyRefreshToken(refreshToken);
        if (!userId) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid or expired refresh token',
          });
        }

        // Get user data
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user || !user.isActive) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'User not found or inactive',
          });
        }

        // Generate new tokens
        const tokens = await generateTokenPair({
          id: user.id,
          email: user.email,
          role: user.role,
        });

        // Set HttpOnly cookies
        setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

        return reply.send(tokens);
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
   * Get current authenticated user info.
   */
  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
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

        // Get app settings
        const settings = await prisma.appSettings.findFirst();

        return reply.send({
          user,
          app: settings ? {
            name: settings.name,
            plan: settings.plan,
          } : null,
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
   * POST /auth/logout
   * Logout current user.
   */
  fastify.post(
    '/logout',
    {
      preHandler: [authenticate],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Clear auth cookies
      clearAuthCookies(reply);

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );
}
