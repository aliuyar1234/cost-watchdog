/**
 * Session Management Routes
 *
 * Provides endpoints for viewing and terminating user sessions.
 * Admin users can manage any user's sessions.
 * Regular users can only view/manage their own sessions.
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { sendNotFound, sendForbidden } from '../lib/errors.js';
import { isValidUUID } from '../lib/validators.js';
import { prisma } from '../lib/db.js';
import {
  listUserSessions,
  terminateSession,
  terminateAllSessions,
  getSession,
} from '../lib/sessions.js';
import { logAuditEvent } from '../lib/audit.js';
import { getAuditContext } from '../middleware/request-context.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface UserIdParams {
  id: string;
}

interface SessionIdParams {
  id: string;
  sessionId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isAdmin(role: string): boolean {
  return role === 'admin';
}

/**
 * Check if the requesting user can access target user's sessions.
 * - Admins can access any user's sessions
 * - Users can only access their own sessions
 * - 'me' is translated to the current user's ID
 */
async function resolveAndAuthorize(
  request: FastifyRequest,
  reply: FastifyReply,
  targetUserId: string
): Promise<{ userId: string; targetUser: { id: string; email: string } } | null> {
  const user = request.user!;

  // Handle 'me' as current user
  const resolvedUserId = targetUserId === 'me' ? user.sub : targetUserId;

  // Validate UUID format
  if (!isValidUUID(resolvedUserId)) {
    sendNotFound(reply, 'User');
    return null;
  }

  // Check authorization
  const isSelf = resolvedUserId === user.sub;
  const userIsAdmin = isAdmin(user.role);

  if (!isSelf && !userIsAdmin) {
    sendForbidden(reply, 'Admin access required to view other users\' sessions');
    return null;
  }

  // Verify target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: resolvedUserId },
    select: { id: true, email: true },
  });

  if (!targetUser) {
    sendNotFound(reply, 'User');
    return null;
  }

  return { userId: resolvedUserId, targetUser };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /users/:id/sessions
   * List all active sessions for a user.
   * Admin can view any user's sessions, users can only view their own.
   */
  fastify.get<{ Params: UserIdParams }>(
    '/:id/sessions',
    async (request, reply) => {
      const auth = await resolveAndAuthorize(request, reply, request.params.id);
      if (!auth) return;

      const { userId } = auth;
      const currentSessionId = request.user!.jti;

      const sessions = await listUserSessions(userId, currentSessionId);

      return reply.send({
        sessions,
        count: sessions.length,
      });
    }
  );

  /**
   * DELETE /users/:id/sessions
   * Terminate all sessions for a user (except current if self).
   * Admin can terminate any user's sessions, users can only terminate their own.
   */
  fastify.delete<{ Params: UserIdParams }>(
    '/:id/sessions',
    async (request, reply) => {
      const auth = await resolveAndAuthorize(request, reply, request.params.id);
      if (!auth) return;

      const { userId, targetUser } = auth;
      const currentUser = request.user!;
      const isSelf = userId === currentUser.sub;

      // Get sessions before termination for audit log
      const sessions = await listUserSessions(userId);

      // Terminate all sessions
      const count = await terminateAllSessions(userId);

      // Audit log
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: userId,
        action: 'session_terminate',
        metadata: {
          terminatedBy: currentUser.sub,
          terminatedByEmail: currentUser.email,
          sessionCount: count,
          sessionIds: sessions.map(s => s.sessionId),
          reason: isSelf ? 'user_initiated' : 'admin_initiated',
        },
        performedBy: currentUser.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send({
        success: true,
        message: `Terminated ${count} session(s)`,
        terminatedCount: count,
      });
    }
  );

  /**
   * DELETE /users/:id/sessions/:sessionId
   * Terminate a specific session.
   */
  fastify.delete<{ Params: SessionIdParams }>(
    '/:id/sessions/:sessionId',
    async (request, reply) => {
      const auth = await resolveAndAuthorize(request, reply, request.params.id);
      if (!auth) return;

      const { userId, targetUser } = auth;
      const { sessionId } = request.params;
      const currentUser = request.user!;

      // Get session info before termination for audit log
      const session = await getSession(sessionId);

      // Verify the session belongs to the target user
      if (session && session.userId !== userId) {
        return sendForbidden(reply, 'Session does not belong to the specified user');
      }

      // Check if trying to terminate current session
      const isCurrentSession = sessionId === currentUser.jti;
      if (isCurrentSession) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Cannot terminate your current session. Use the logout endpoint instead.',
        });
      }

      // Terminate the session
      const terminated = await terminateSession(sessionId, userId);

      if (!terminated) {
        return sendNotFound(reply, 'Session');
      }

      // Audit log
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: userId,
        action: 'session_terminate',
        metadata: {
          terminatedBy: currentUser.sub,
          terminatedByEmail: currentUser.email,
          sessionId,
          sessionDetails: session
            ? {
                device: session.deviceType,
                browser: session.browser,
                os: session.os,
                ipAddress: session.ipAddress,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
              }
            : null,
          reason: userId === currentUser.sub ? 'user_initiated' : 'admin_initiated',
        },
        performedBy: currentUser.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send({
        success: true,
        message: 'Session terminated successfully',
        sessionId,
      });
    }
  );
};

export default sessionRoutes;
