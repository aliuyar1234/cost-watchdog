import { randomUUID } from 'crypto';
import { prisma } from '../../lib/db.js';
import { verifyPassword, generateTokenPairWithFamily } from '../../lib/auth.js';
import {
  checkLockout,
  recordFailedAttempt,
  resetAttempts,
  invalidateAllSessionsForUser,
} from '../../lib/account-lockout.js';
import { createSession, terminateAllSessions } from '../../lib/sessions.js';
import { createTokenFamily, invalidateAllFamiliesForUser } from '../../lib/token-rotation.js';
import { logAuditEvent } from '../../lib/audit.js';
import { ANONYMOUS_USER_ID } from './constants.js';
import type { AuthContext, AuthError, AuthLogger, AuthResponse, LoginInput } from './types.js';

interface LoginUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  passwordHash: string;
  isActive: boolean;
}

interface ValidatedLoginUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export async function loginUser(
  input: LoginInput,
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<AuthResponse> {
  const { email, password } = input;

  const lockoutError = await checkAccountLockout(email, ctx);
  if (lockoutError) {
    return lockoutError;
  }

  const userResult = await findAndValidateUser(email, password, ctx, logger);
  if (!userResult.success) {
    return userResult.error;
  }
  const user = userResult.user;

  await prepareNewSession(user.id, email, logger);
  const tokens = await issueTokensAndSession(user, ctx, logger);

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
  };
}

async function checkAccountLockout(email: string, ctx: AuthContext): Promise<AuthError | null> {
  const lockoutStatus = await checkLockout(email);
  if (!lockoutStatus.locked) {
    return null;
  }

  await logFailedLogin(email, 'account_locked', ctx, lockoutStatus.reason);

  if (lockoutStatus.reason === 'permanent') {
    return {
      success: false,
      error: 'Account Locked',
      message:
        'Account has been locked due to too many failed attempts. Contact an administrator to unlock.',
      statusCode: 423,
    };
  }

  return {
    success: false,
    error: 'Account Locked',
    message: `Account temporarily locked. Try again in ${Math.ceil((lockoutStatus.retryAfterSeconds ?? 0) / 60)} minutes.`,
    statusCode: 423,
    retryAfter: lockoutStatus.retryAfterSeconds,
  };
}

async function findAndValidateUser(
  email: string,
  password: string,
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<
  | {
      success: true;
      user: ValidatedLoginUser;
    }
  | { success: false; error: AuthError }
> {
  const user = (await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })) as LoginUser | null;

  if (!user || !user.isActive || !user.passwordHash) {
    const newLockoutStatus = await recordFailedAttempt(email, 'user_not_found_or_inactive');
    await logFailedLogin(email, 'user_not_found_or_inactive', ctx);

    if (newLockoutStatus.locked) {
      return {
        success: false,
        error: {
          success: false,
          error: 'Account Locked',
          message: 'Account locked due to too many failed attempts. Try again later.',
          statusCode: 423,
          retryAfter: newLockoutStatus.retryAfterSeconds,
        },
      };
    }

    return {
      success: false,
      error: {
        success: false,
        error: 'Unauthorized',
        message: 'Invalid email or password',
        statusCode: 401,
      },
    };
  }

  const isValid = await verifyPassword(user.passwordHash, password);
  if (!isValid) {
    const error = await handleInvalidPassword(user, email, ctx, logger);
    return { success: false, error };
  }

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

async function handleInvalidPassword(
  user: { id: string; email: string },
  email: string,
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<AuthError> {
  const newLockoutStatus = await recordFailedAttempt(email, 'invalid_password');

  await logAuditEvent({
    entityType: 'user',
    entityId: user.id,
    action: 'login_failed',
    metadata: { email: user.email, reason: 'invalid_password' },
    performedBy: user.id,
    ...ctx,
  }).catch((err) => logger?.error(err, 'Failed to log audit event'));

  if (newLockoutStatus.locked) {
    await invalidateAllSessionsForUser(user.id);

    await logAuditEvent({
      entityType: 'user',
      entityId: user.id,
      action: 'account_lock',
      metadata: { reason: 'too_many_failed_attempts', lockoutReason: newLockoutStatus.reason },
      performedBy: 'system',
      ...ctx,
    }).catch((err) => logger?.error(err, 'Failed to log audit event'));

    return {
      success: false,
      error: 'Account Locked',
      message: 'Account locked due to too many failed attempts. Try again later.',
      statusCode: 423,
      retryAfter: newLockoutStatus.retryAfterSeconds,
    };
  }

  return {
    success: false,
    error: 'Unauthorized',
    message: 'Invalid email or password',
    statusCode: 401,
  };
}

async function prepareNewSession(
  userId: string,
  email: string,
  logger?: AuthLogger,
): Promise<void> {
  await resetAttempts(email);

  await terminateAllSessions(userId).catch((err) =>
    logger?.error(err, 'Failed to terminate existing sessions during login'),
  );
  await invalidateAllFamiliesForUser(userId, 'new_login').catch((err) =>
    logger?.error(err, 'Failed to invalidate token families during login'),
  );

  prisma.user
    .update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    })
    .catch((err) => logger?.error(err, 'Failed to update last login'));
}

async function issueTokensAndSession(
  user: { id: string; email: string; role: string },
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const familyId = randomUUID();
  const tokens = await generateTokenPairWithFamily(
    { id: user.id, email: user.email, role: user.role },
    familyId,
  );

  const tokenFamily = await createTokenFamily(user.id, tokens.refreshToken, familyId);

  await createSession(tokens.sessionId, user.id, ctx.ipAddress, ctx.userAgent).catch((err) =>
    logger?.error(err, 'Failed to create session'),
  );

  await logAuditEvent({
    entityType: 'user',
    entityId: user.id,
    action: 'login',
    metadata: {
      email: user.email,
      sessionId: tokens.sessionId,
      tokenFamilyId: tokenFamily.familyId,
    },
    performedBy: user.id,
    ...ctx,
  }).catch((err) => logger?.error(err, 'Failed to log audit event'));

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
  };
}

async function logFailedLogin(
  email: string,
  reason: string,
  ctx: AuthContext,
  lockoutReason?: string,
): Promise<void> {
  await logAuditEvent({
    entityType: 'user',
    entityId: ANONYMOUS_USER_ID,
    action: 'login_failed',
    metadata: { email: email.toLowerCase(), reason, lockoutReason },
    performedBy: 'anonymous',
    ...ctx,
  }).catch(() => {
    // Ignore audit failures for failed logins.
  });
}
