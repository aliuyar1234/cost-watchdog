import { FastifyPluginAsync } from 'fastify';
import { hash } from '@node-rs/argon2';
import { prisma } from '../lib/db.js';
import { sendNotFound, sendBadRequest, sendForbidden } from '../lib/errors.js';
import { isValidUUID } from '../lib/validators.js';
import { authenticate } from '../middleware/auth.js';
import { requireScope } from '../lib/api-key-scopes.js';
import { logAuditEvent, calculateChanges, sanitizeForAudit } from '../lib/audit.js';
import { getAuditContext } from '../middleware/request-context.js';
import { unlockAccount, checkLockout } from '../lib/account-lockout.js';
import { performGdprDeletion, canPerformGdprDeletion } from '../lib/gdpr.js';
import { terminateAllSessions } from '../lib/sessions.js';
import { invalidateAllFamiliesForUser } from '../lib/token-rotation.js';

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
   * API keys need read:users scope
   */
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
   * API keys need read:users scope
   */
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
   * API keys need write:users scope
   */
  fastify.post<{ Body: CreateUserBody }>(
    '/',
    { preHandler: requireScope('write:users') },
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

      // Audit log: user created
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
    }
  );

  /**
   * PATCH /users/:id
   * API keys need write:users scope
   */
  fastify.patch<{ Params: UserIdParams; Body: UpdateUserBody }>(
    '/:id',
    { preHandler: requireScope('write:users') },
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

      // Audit log: user updated
      const ctx = getAuditContext(request);
      const changes = calculateChanges(
        sanitizeForAudit({ ...existing }),
        sanitizeForAudit({ ...updatedUser })
      );

      // Special handling for role changes
      const roleChanged = body.role && body.role !== existing.role;
      const action = roleChanged ? 'role_change' : 'update';

      // Session fixation prevention: Invalidate all sessions on role change
      // This prevents privilege escalation attacks using existing sessions
      if (roleChanged) {
        await terminateAllSessions(id).catch((err) =>
          request.log.error(err, 'Failed to terminate sessions after role change')
        );
        await invalidateAllFamiliesForUser(id, 'role_change').catch((err) =>
          request.log.error(err, 'Failed to invalidate token families after role change')
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
    }
  );

  /**
   * DELETE /users/:id
   * API keys need write:users scope
   */
  fastify.delete<{ Params: UserIdParams }>(
    '/:id',
    { preHandler: requireScope('write:users') },
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

      // Audit log: user deactivated
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
    }
  );

  /**
   * POST /users/:id/reset-password
   * API keys need write:users scope
   */
  fastify.post<{ Params: UserIdParams; Body: { newPassword: string } }>(
    '/:id/reset-password',
    { preHandler: requireScope('write:users') },
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

      // Session fixation prevention: Invalidate all sessions on password change
      // This forces the user to re-authenticate with their new password
      await terminateAllSessions(id).catch((err) =>
        request.log.error(err, 'Failed to terminate sessions after password reset')
      );
      await invalidateAllFamiliesForUser(id, 'password_change').catch((err) =>
        request.log.error(err, 'Failed to invalidate token families after password reset')
      );

      // Audit log: password reset by admin
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: id,
        action: 'password_change',
        metadata: { resetByAdmin: true, adminId: user.sub, sessionsInvalidated: true },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send({ success: true, message: 'Password reset successfully' });
    }
  );

  /**
   * POST /users/:id/unlock
   * Unlock a locked user account (admin only).
   * Clears all lockout data including failed attempts and lockout count.
   * API keys need write:users scope
   */
  fastify.post<{ Params: UserIdParams }>(
    '/:id/unlock',
    { preHandler: requireScope('write:users') },
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const { id } = request.params;

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'User');
      }

      // Get the target user
      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!targetUser) {
        return sendNotFound(reply, 'User');
      }

      // Check if account is actually locked
      const lockoutStatus = await checkLockout(targetUser.email);

      if (!lockoutStatus.locked) {
        return reply.send({
          success: true,
          message: 'Account is not locked',
          wasLocked: false,
        });
      }

      // Unlock the account
      await unlockAccount(targetUser.email);

      // Audit log: account unlocked by admin
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: id,
        action: 'account_unlock',
        metadata: {
          unlockedByAdmin: true,
          adminId: user.sub,
          previousLockoutReason: lockoutStatus.reason,
        },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send({
        success: true,
        message: 'Account unlocked successfully',
        wasLocked: true,
        previousLockoutReason: lockoutStatus.reason,
      });
    }
  );

  /**
   * DELETE /users/:id/gdpr-delete
   * GDPR-compliant permanent deletion of a user.
   * Removes PII, anonymizes audit logs, terminates sessions.
   * API keys need write:users scope
   */
  fastify.delete<{ Params: UserIdParams; Body: { reason?: string } }>(
    '/:id/gdpr-delete',
    { preHandler: requireScope('write:users') },
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const { id } = request.params;
      const body = request.body as { reason?: string } || {};

      if (!isValidUUID(id)) {
        return sendNotFound(reply, 'User');
      }

      // Prevent self-deletion
      if (id === user.sub) {
        return sendBadRequest(reply, 'Cannot GDPR delete your own account');
      }

      // Check if deletion is possible
      const canDelete = await canPerformGdprDeletion(id);
      if (!canDelete.canDelete) {
        return sendBadRequest(reply, canDelete.reason || 'Cannot delete user');
      }

      // Get audit context
      const ctx = getAuditContext(request);

      // Perform GDPR deletion
      const result = await performGdprDeletion(id, {
        performedBy: user.sub,
        reason: body.reason || 'User requested deletion',
        requestId: ctx.requestId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      if (!result.success) {
        return sendBadRequest(reply, result.error || 'GDPR deletion failed');
      }

      return reply.send({
        success: true,
        message: 'User permanently deleted (GDPR)',
        deletedAt: result.deletedAt.toISOString(),
        summary: {
          anonymizedAuditLogs: result.anonymizedAuditLogs,
          terminatedSessions: result.terminatedSessions,
          flaggedDocuments: result.flaggedDocuments,
        },
      });
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
