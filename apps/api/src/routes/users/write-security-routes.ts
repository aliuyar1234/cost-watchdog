import { hash } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { sendBadRequest, sendNotFound } from '../../lib/errors.js';
import { requireScope } from '../../lib/api-key-scopes.js';
import { logAuditEvent } from '../../lib/audit.js';
import { getAuditContext } from '../../middleware/request-context.js';
import { unlockAccount, checkLockout } from '../../lib/account-lockout.js';
import { terminateAllSessions } from '../../lib/sessions.js';
import { invalidateAllFamiliesForUser } from '../../lib/token-rotation.js';
import type { UserIdParams } from './shared.js';
import { ensureAdminAccess, ensureValidUserId } from './write-shared.js';

interface ResetPasswordBody {
  newPassword: string;
}

export async function registerUserSecurityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: UserIdParams; Body: ResetPasswordBody }>(
    '/:id/reset-password',
    { preHandler: requireScope('write:users') },
    async (request, reply) => {
      const user = request.user!;

      if (!ensureAdminAccess(user.role, reply)) {
        return reply;
      }

      const { id } = request.params;
      const body = request.body as ResetPasswordBody;

      if (!ensureValidUserId(id, reply)) {
        return reply;
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

      await terminateAllSessions(id).catch((err) =>
        request.log.error(err, 'Failed to terminate sessions after password reset'),
      );
      await invalidateAllFamiliesForUser(id, 'password_change').catch((err) =>
        request.log.error(err, 'Failed to invalidate token families after password reset'),
      );

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
    },
  );

  fastify.post<{ Params: UserIdParams }>(
    '/:id/unlock',
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

      const targetUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!targetUser) {
        return sendNotFound(reply, 'User');
      }

      const lockoutStatus = await checkLockout(targetUser.email);

      if (!lockoutStatus.locked) {
        return reply.send({
          success: true,
          message: 'Account is not locked',
          wasLocked: false,
        });
      }

      await unlockAccount(targetUser.email);

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
    },
  );
}
