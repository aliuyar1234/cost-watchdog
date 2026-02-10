import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { extractToken, authenticate } from '../../middleware/auth.js';
import { authService } from '../../services/auth.service.js';
import { clearAuthCookies, getAuthContext } from './shared.js';

export async function registerAuthProtectedRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
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
    } catch (cause) {
      request.log.error(cause, 'Failed to get user info');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get user info',
      });
    }
  });

  fastify.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      await authService.logout(
        request.user?.sub,
        request.user?.jti,
        extractToken(request) ?? undefined,
        request.cookies?.['refreshToken'] ?? undefined,
        getAuthContext(request),
        request.log,
      );

      clearAuthCookies(reply);
      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (cause) {
      request.log.error(cause, 'Logout failed');
      clearAuthCookies(reply);
      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  });
}
