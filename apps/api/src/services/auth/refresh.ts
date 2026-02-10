import { randomUUID } from 'crypto';
import { prisma } from '../../lib/db.js';
import { verifyRefreshTokenWithFamily, generateTokenPairWithFamily } from '../../lib/auth.js';
import { isTokenBlacklisted } from '../../lib/redis.js';
import { isSessionBlacklisted, terminateAllSessions } from '../../lib/sessions.js';
import {
  createTokenFamily,
  rotateToken,
  invalidateAllFamiliesForUser,
} from '../../lib/token-rotation.js';
import { isUserBlacklisted } from '../../lib/account-lockout.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { AuthContext, AuthLogger, RefreshResponse } from './types.js';

export async function refreshTokens(
  refreshToken: string,
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<RefreshResponse> {
  if (await isTokenBlacklisted(refreshToken)) {
    return {
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token',
      statusCode: 401,
    };
  }

  const tokenData = await verifyRefreshTokenWithFamily(refreshToken);
  if (!tokenData) {
    return {
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token',
      statusCode: 401,
    };
  }

  const { userId, familyId, sessionId, issuedAt } = tokenData;

  if (sessionId && (await isSessionBlacklisted(sessionId))) {
    return {
      success: false,
      error: 'Unauthorized',
      message: 'Session has been terminated',
      statusCode: 401,
    };
  }

  if (typeof issuedAt !== 'number') {
    return {
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token',
      statusCode: 401,
    };
  }

  if (await isUserBlacklisted(userId, issuedAt)) {
    return {
      success: false,
      error: 'Unauthorized',
      message: 'User access has been revoked. Please log in again.',
      statusCode: 401,
      securityEvent: true,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    return {
      success: false,
      error: 'Unauthorized',
      message: 'User not found or inactive',
      statusCode: 401,
    };
  }

  let newTokens: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    familyId: string;
  };

  if (familyId) {
    newTokens = await generateTokenPairWithFamily(
      { id: user.id, email: user.email, role: user.role },
      familyId,
      sessionId ?? undefined,
    );

    const rotationResult = await rotateToken(familyId, refreshToken, newTokens.refreshToken);
    if (!rotationResult.success) {
      return handleRotationFailure({
        userId: user.id,
        familyId,
        rotationError: rotationResult.error,
        theftDetected: rotationResult.theftDetected || false,
        ctx,
        logger,
      });
    }
  } else {
    const newFamilyId = randomUUID();
    await createTokenFamily(user.id, refreshToken, newFamilyId);

    newTokens = await generateTokenPairWithFamily(
      { id: user.id, email: user.email, role: user.role },
      newFamilyId,
      sessionId ?? undefined,
    );

    const rotationResult = await rotateToken(newFamilyId, refreshToken, newTokens.refreshToken);
    if (!rotationResult.success) {
      return handleRotationFailure({
        userId: user.id,
        familyId: newFamilyId,
        rotationError: rotationResult.error,
        theftDetected: rotationResult.theftDetected || false,
        ctx,
        logger,
      });
    }
  }

  await logAuditEvent({
    entityType: 'user',
    entityId: user.id,
    action: 'token_refresh',
    metadata: { familyId: newTokens.familyId },
    performedBy: user.id,
    ...ctx,
  }).catch((err) => logger?.error(err, 'Failed to log audit event'));

  return {
    success: true,
    accessToken: newTokens.accessToken,
    refreshToken: newTokens.refreshToken,
    sessionId: newTokens.sessionId,
  };
}

interface RotationFailureInput {
  userId: string;
  familyId: string;
  rotationError?: string;
  theftDetected: boolean;
  ctx: AuthContext;
  logger?: AuthLogger;
}

async function handleRotationFailure({
  userId,
  familyId,
  rotationError,
  theftDetected,
  ctx,
  logger,
}: RotationFailureInput): Promise<RefreshResponse> {
  await logAuditEvent({
    entityType: 'user',
    entityId: userId,
    action: 'token_refresh',
    metadata: {
      error: rotationError,
      theftDetected,
      familyId,
    },
    performedBy: userId,
    ...ctx,
  }).catch((err) => logger?.error(err, 'Failed to log audit event'));

  if (theftDetected) {
    await terminateAllSessions(userId).catch((err) =>
      logger?.error(err, 'Failed to terminate sessions after token theft'),
    );
    await invalidateAllFamiliesForUser(userId, 'token_theft_detected').catch((err) =>
      logger?.error(err, 'Failed to invalidate token families'),
    );

    return {
      success: false,
      error: 'Unauthorized',
      message: 'Security violation detected. Please log in again.',
      statusCode: 401,
      securityEvent: true,
    };
  }

  return {
    success: false,
    error: 'Unauthorized',
    message: rotationError || 'Token refresh failed',
    statusCode: 401,
  };
}
