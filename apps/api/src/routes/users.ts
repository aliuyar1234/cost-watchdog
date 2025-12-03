import { FastifyPluginAsync } from 'fastify';
import { hash } from '@node-rs/argon2';
import { prisma } from '../lib/db.js';
import { sendNotFound, sendBadRequest, sendForbidden } from '../lib/errors.js';
import { isValidUUID } from '../lib/validators.js';
import { authenticate } from '../middleware/auth.js';

interface UserQuery {
  role?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

interface UserIdParams {
  id: string;
}

interface CreateUserBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'analyst' | 'viewer' | 'auditor';
  allowedLocationIds?: string[];
  allowedCostCenterIds?: string[];
}

interface UpdateUserBody {
  firstName?: string;
  lastName?: string;
  role?: 'admin' | 'manager' | 'analyst' | 'viewer' | 'auditor';
  isActive?: boolean;
  allowedLocationIds?: string[];
  allowedCostCenterIds?: string[];
}

interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  allowedLocationIds: string[];
  allowedCostCenterIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

function requireAdmin(userRole: string): boolean {
  return userRole === 'admin';
}

/**
 * User management routes
 */
export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /users
   */
  fastify.get<{ Querystring: UserQuery }>(
    '/',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const query = request.query as UserQuery;
      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;

      const where: Record<string, unknown> = {};
      if (query.role) where['role'] = query.role;
      if (query.isActive !== undefined) where['isActive'] = query.isActive;

      const [data, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            allowedLocationIds: true,
            allowedCostCenterIds: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.user.count({ where }),
      ]);

      return reply.send({
        data: data.map(formatUser),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + data.length < total,
        },
      });
    }
  );

  /**
   * GET /users/:id
   */
  fastify.get<{ Params: UserIdParams }>(
    '/:id',
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'User');
      }

      if (id !== user.sub && !requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          allowedLocationIds: true,
          allowedCostCenterIds: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      if (!targetUser) {
        return sendNotFound(reply, 'User');
      }

      return reply.send(formatUser(targetUser));
    }
  );

  /**
   * POST /users
   */
  fastify.post<{ Body: CreateUserBody }>(
    '/',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const body = request.body as CreateUserBody;

      if (!body.email || !body.password || !body.firstName || !body.lastName) {
        return sendBadRequest(reply, 'Email, password, firstName, and lastName are required');
      }

      if (body.password.length < 8) {
        return sendBadRequest(reply, 'Password must be at least 8 characters');
      }

      const existing = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
      });

      if (existing) {
        return sendBadRequest(reply, 'A user with this email already exists');
      }

      const passwordHash = await hash(body.password);

      const newUser = await prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
          role: body.role || 'viewer',
          allowedLocationIds: body.allowedLocationIds || [],
          allowedCostCenterIds: body.allowedCostCenterIds || [],
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          allowedLocationIds: true,
          allowedCostCenterIds: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      return reply.status(201).send(formatUser(newUser));
    }
  );

  /**
   * PATCH /users/:id
   */
  fastify.patch<{ Params: UserIdParams; Body: UpdateUserBody }>(
    '/:id',
    async (request, reply) => {
      const user = request.user!;

      const { id } = request.params;
      const body = request.body as UpdateUserBody;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'User');
      }

      const isSelf = id === user.sub;
      const isAdmin = requireAdmin(user.role);

      if (!isSelf && !isAdmin) {
        return sendForbidden(reply, 'Admin access required');
      }

      if ((body.role || body.isActive !== undefined || body.allowedLocationIds || body.allowedCostCenterIds) && !isAdmin) {
        return sendForbidden(reply, 'Only admins can modify roles and permissions');
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'User');
      }

      const updateData: Record<string, unknown> = {};
      if (body.firstName) updateData['firstName'] = body.firstName;
      if (body.lastName) updateData['lastName'] = body.lastName;
      if (body.role && isAdmin) updateData['role'] = body.role;
      if (body.isActive !== undefined && isAdmin) updateData['isActive'] = body.isActive;
      if (body.allowedLocationIds && isAdmin) updateData['allowedLocationIds'] = body.allowedLocationIds;
      if (body.allowedCostCenterIds && isAdmin) updateData['allowedCostCenterIds'] = body.allowedCostCenterIds;

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          allowedLocationIds: true,
          allowedCostCenterIds: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      return reply.send(formatUser(updatedUser));
    }
  );

  /**
   * DELETE /users/:id
   */
  fastify.delete<{ Params: UserIdParams }>(
    '/:id',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const { id } = request.params;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'User');
      }

      if (id === user.sub) {
        return sendBadRequest(reply, 'Cannot delete your own account');
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'User');
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      return reply.status(204).send();
    }
  );

  /**
   * POST /users/:id/reset-password
   */
  fastify.post<{ Params: UserIdParams; Body: { newPassword: string } }>(
    '/:id/reset-password',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const { id } = request.params;
      const body = request.body as { newPassword: string };

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'User');
      }

      if (!body.newPassword || body.newPassword.length < 8) {
        return sendBadRequest(reply, 'Password must be at least 8 characters');
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'User');
      }

      const passwordHash = await hash(body.newPassword);

      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });

      return reply.send({ success: true, message: 'Password reset successfully' });
    }
  );
};

function formatUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  allowedLocationIds: string[];
  allowedCostCenterIds: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    allowedLocationIds: user.allowedLocationIds,
    allowedCostCenterIds: user.allowedCostCenterIds,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export default userRoutes;
