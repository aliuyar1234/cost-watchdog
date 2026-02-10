import { hash } from '@node-rs/argon2';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { sendBadRequest, sendForbidden, sendNotFound } from '../../lib/errors.js';
import { requireScope } from '../../lib/api-key-scopes.js';
import { logAuditEvent, calculateChanges, sanitizeForAudit } from '../../lib/audit.js';
import { getAuditContext } from '../../middleware/request-context.js';
import { terminateAllSessions } from '../../lib/sessions.js';
import { invalidateAllFamiliesForUser } from '../../lib/token-rotation.js';
import {
  formatUser,
  requireAdmin,
  userSelect,
  type CreateUserBody,
  type UpdateUserBody,
  type UserIdParams,
} from './shared.js';
import { ensureAdminAccess, ensureValidUserId } from './write-shared.js';

export async function registerUserLifecycleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: CreateUserBody }>(
    '/',
    { preHandler: requireScope('write:users') },
    async (request, reply) => {
      const user = request.user!;

      if (!ensureAdminAccess(user.role, reply)) {
        return reply;
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
        select: userSelect,
      });

      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: newUser.id,
        action: 'create',
        after: sanitizeForAudit({ ...newUser }),
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.status(201).send(formatUser(newUser));
    },
  );

  fastify.patch<{ Params: UserIdParams; Body: UpdateUserBody }>(
    '/:id',
    { preHandler: requireScope('write:users') },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params;
      const body = request.body as UpdateUserBody;

      if (!ensureValidUserId(id, reply)) {
        return reply;
      }

      const isSelf = id === user.sub;
      const isAdmin = requireAdmin(user.role);

      if (!isSelf && !isAdmin) {
        return sendForbidden(reply, 'Admin access required');
      }

      if (
        (body.role ||
          body.isActive !== undefined ||
          body.allowedLocationIds ||
          body.allowedCostCenterIds) &&
        !isAdmin
      ) {
        return sendForbidden(reply, 'Only admins can modify roles and permissions');
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'User');
      }

      const updateData: Prisma.UserUpdateInput = {};
      if (body.firstName) updateData.firstName = body.firstName;
      if (body.lastName) updateData.lastName = body.lastName;
      if (body.role && isAdmin) updateData.role = body.role;
      if (body.isActive !== undefined && isAdmin) updateData.isActive = body.isActive;
      if (body.allowedLocationIds && isAdmin)
        updateData.allowedLocationIds = body.allowedLocationIds;
      if (body.allowedCostCenterIds && isAdmin)
        updateData.allowedCostCenterIds = body.allowedCostCenterIds;

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: userSelect,
      });

      const ctx = getAuditContext(request);
      const changes = calculateChanges(
        sanitizeForAudit({ ...existing }),
        sanitizeForAudit({ ...updatedUser }),
      );

      const roleChanged = Boolean(body.role && body.role !== existing.role);
      const action = roleChanged ? 'role_change' : 'update';

      if (roleChanged) {
        await terminateAllSessions(id).catch((err) =>
          request.log.error(err, 'Failed to terminate sessions after role change'),
        );
        await invalidateAllFamiliesForUser(id, 'role_change').catch((err) =>
          request.log.error(err, 'Failed to invalidate token families after role change'),
        );
      }

      await logAuditEvent({
        entityType: 'user',
        entityId: id,
        action,
        before: sanitizeForAudit({ ...existing }),
        after: sanitizeForAudit({ ...updatedUser }),
        changes,
        metadata: roleChanged ? { sessionsInvalidated: true } : undefined,
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send(formatUser(updatedUser));
    },
  );

  fastify.delete<{ Params: UserIdParams }>(
    '/:id',
    { preHandler: requireScope('write:users') },
    async (request, reply) => {
      const user = request.user!;

      if (!ensureAdminAccess(user.role, reply)) {
        return reply;
      }

      const { id } = request.params;

      if (!ensureValidUserId(id, reply)) {
        return reply;
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

      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: id,
        action: 'delete',
        before: sanitizeForAudit({ ...existing }),
        metadata: { deactivated: true },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.status(204).send();
    },
  );
}
