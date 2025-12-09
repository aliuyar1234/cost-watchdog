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
import { authenticate, extractToken } from '../middleware/auth.js';
import { blacklistToken } from '../lib/redis.js';

// Access token TTL in seconds (15 minutes)
const ACCESS_TOKEN_TTL = 15 * 60;
// Refresh token TTL in seconds (7 days)
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

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
          // Return generic message to prevent user enumeration
          // Use same timing as successful registration to prevent timing attacks
          await hashPassword(password); // Consume similar time
          return reply.code(400).send({
            error: 'Registration Failed',
            message: 'Unable to complete registration. Please try again or contact support.',
          });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Security: All users start as viewers
        // Admin setup must be done via secure channel (environment variable or database seed)
        // Check for INITIAL_ADMIN_EMAIL environment variable for first admin setup
        const initialAdminEmail = process.env['INITIAL_ADMIN_EMAIL']?.toLowerCase();
        const userCount = await prisma.user.count();
        const isInitialAdmin = userCount === 0 && initialAdminEmail && email.toLowerCase() === initialAdminEmail;
        const role = isInitialAdmin ? 'admin' : 'viewer';

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
   * Logout current user and invalidate tokens.
   */
  fastify.post(
    '/logout',
    {
      preHandler: [authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Blacklist the current access token
        const accessToken = extractToken(request);
        if (accessToken) {
          await blacklistToken(accessToken, ACCESS_TOKEN_TTL);
        }

        // Blacklist the refresh token if present
        const refreshToken = request.cookies?.['refreshToken'];
        if (refreshToken) {
          await blacklistToken(refreshToken, REFRESH_TOKEN_TTL);
        }

        // Clear auth cookies
        clearAuthCookies(reply);

        return reply.send({
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        request.log.error(error, 'Logout failed');
        // Still clear cookies even if blacklisting fails
        clearAuthCookies(reply);
        return reply.send({
          success: true,
          message: 'Logged out successfully',
        });
      }
    }
  );
}
