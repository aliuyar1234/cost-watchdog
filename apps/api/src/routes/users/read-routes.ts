import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { sendForbidden, sendNotFound } from '../../lib/errors.js';
import { isValidUUID } from '../../lib/validators.js';
import { requireScope } from '../../lib/api-key-scopes.js';
import {
  formatUser,
  requireAdmin,
  userSelect,
  type UserIdParams,
  type UserQuery,
} from './shared.js';

export async function registerUserReadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: UserQuery }>(
    '/',
    { preHandler: requireScope('read:users') },
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
          select: userSelect,
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
    },
  );

  fastify.get<{ Params: UserIdParams }>(
    '/:id',
    { preHandler: requireScope('read:users') },
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
        select: userSelect,
      });

      if (!targetUser) {
        return sendNotFound(reply, 'User');
      }

      return reply.send(formatUser(targetUser));
    },
  );
}
