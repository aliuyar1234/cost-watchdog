import { logAuditEvent } from '../../lib/audit.js';
import {
  createPasswordResetToken,
  resetPassword,
  validateResetToken,
} from '../../lib/password-reset.js';
import { terminateAllSessions } from '../../lib/sessions.js';
import { ANONYMOUS_USER_ID } from './constants.js';
import type {
  AuthContext,
  AuthError,
  AuthLogger,
  PasswordResetRequestResult,
  PasswordResetResult,
} from './types.js';

export async function requestPasswordReset(
  email: string,
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<PasswordResetRequestResult | AuthError> {
  const result = await createPasswordResetToken(email, ctx.ipAddress);

  if (!result.success) {
    return {
      success: false,
      error: 'Too Many Requests',
      message: result.error || 'Rate limited',
      statusCode: 429,
      retryAfter: result.retryAfter,
    };
  }

  await logAuditEvent({
    entityType: 'user',
    entityId: ANONYMOUS_USER_ID,
    action: 'password_reset_request',
    metadata: { email: email.toLowerCase() },
    performedBy: 'anonymous',
    ...ctx,
  }).catch((err) => logger?.error(err, 'Failed to log audit event'));

  return {
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
    token: process.env['NODE_ENV'] !== 'production' ? result.token : undefined,
  };
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<PasswordResetResult | AuthError> {
  const result = await resetPassword(token, newPassword);

  if (!result.success) {
    return {
      success: false,
      error: 'Password Reset Failed',
      message: result.error || 'Failed to reset password',
      statusCode: 400,
    };
  }

  const validation = await validateResetToken(token);

  await logAuditEvent({
    entityType: 'user',
    entityId: validation.userId || ANONYMOUS_USER_ID,
    action: 'password_reset_complete',
    performedBy: validation.userId || 'anonymous',
    ...ctx,
  }).catch((err) => logger?.error(err, 'Failed to log audit event'));

  if (validation.userId) {
    await terminateAllSessions(validation.userId).catch((err) =>
      logger?.error(err, 'Failed to terminate sessions after password reset'),
    );
  }

  return {
    success: true,
    message: 'Password has been reset successfully. Please log in with your new password.',
  };
}
