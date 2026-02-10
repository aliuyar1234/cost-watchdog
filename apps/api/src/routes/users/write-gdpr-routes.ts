import type { FastifyInstance } from 'fastify';
import { sendBadRequest } from '../../lib/errors.js';
import { requireScope } from '../../lib/api-key-scopes.js';
import { performGdprDeletion, canPerformGdprDeletion } from '../../lib/gdpr.js';
import { getAuditContext } from '../../middleware/request-context.js';
import type { UserIdParams } from './shared.js';
import { ensureAdminAccess, ensureValidUserId } from './write-shared.js';

interface GdprDeleteBody {
  reason?: string;
}

export async function registerUserGdprRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.delete<{ Params: UserIdParams; Body: GdprDeleteBody }>(
    '/:id/gdpr-delete',
    { preHandler: requireScope('write:users') },
    async (request, reply) => {
      const user = request.user!;

      if (!ensureAdminAccess(user.role, reply)) {
        return reply;
      }

      const { id } = request.params;
      const body = (request.body as GdprDeleteBody) || {};

      if (!ensureValidUserId(id, reply)) {
        return reply;
      }

      if (id === user.sub) {
        return sendBadRequest(reply, 'Cannot GDPR delete your own account');
      }

      const canDelete = await canPerformGdprDeletion(id);
      if (!canDelete.canDelete) {
        return sendBadRequest(reply, canDelete.reason || 'Cannot delete user');
      }

      const ctx = getAuditContext(request);
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
    },
  );
}
