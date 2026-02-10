import { blacklistToken } from '../../lib/redis.js';
import { logAuditEvent } from '../../lib/audit.js';
import { terminateSession } from '../../lib/sessions.js';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from './constants.js';
import type { AuthContext, AuthLogger, LogoutResult } from './types.js';

interface LogoutInput {
  userId: string | undefined;
  sessionId: string | undefined;
  accessToken: string | undefined;
  refreshToken: string | undefined;
  ctx: AuthContext;
  logger?: AuthLogger;
}

export async function logoutUser({
  userId,
  sessionId,
  accessToken,
  refreshToken,
  ctx,
  logger,
}: LogoutInput): Promise<LogoutResult> {
  if (sessionId && userId) {
    const terminated = await terminateSession(sessionId, userId, accessToken, refreshToken);
    if (!terminated) {
      if (accessToken) {
        await blacklistToken(accessToken, ACCESS_TOKEN_TTL);
      }
      if (refreshToken) {
        await blacklistToken(refreshToken, REFRESH_TOKEN_TTL);
      }
    }
  } else {
    if (accessToken) {
      await blacklistToken(accessToken, ACCESS_TOKEN_TTL);
    }
    if (refreshToken) {
      await blacklistToken(refreshToken, REFRESH_TOKEN_TTL);
    }
  }

  if (userId) {
    await logAuditEvent({
      entityType: 'user',
      entityId: userId,
      action: 'logout',
      metadata: { sessionId },
      performedBy: userId,
      ...ctx,
    }).catch((err) => logger?.error(err, 'Failed to log audit event'));
  }

  return {
    success: true,
    message: 'Logged out successfully',
  };
}
