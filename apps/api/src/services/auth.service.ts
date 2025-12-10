/**
 * Auth Service
 *
 * Business logic for authentication operations.
 * Extracted from routes/auth.ts for better testability and reuse.
 */

import { prisma } from '../lib/db.js';
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
  generateTokenPairWithFamily,
  verifyRefreshTokenWithFamily,
} from '../lib/auth.js';
import { blacklistToken } from '../lib/redis.js';
import { logAuditEvent } from '../lib/audit.js';
import { validatePassword } from '../lib/password-policy.js';
import {
  checkLockout,
  recordFailedAttempt,
  resetAttempts,
  invalidateAllSessionsForUser,
} from '../lib/account-lockout.js';
import { createSession, terminateSession, terminateAllSessions } from '../lib/sessions.js';
import {
  createPasswordResetToken,
  validateResetToken,
  resetPassword as resetPasswordLib,
} from '../lib/password-reset.js';
import {
  createTokenFamily,
  rotateToken,
  invalidateAllFamiliesForUser,
} from '../lib/token-rotation.js';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface AuthContext {
  requestId: string;
  ipAddress: string;
  userAgent: string | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UserDTO {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface AuthResult {
  success: true;
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface AuthError {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
  retryAfter?: number;
  securityEvent?: boolean;
}

export type AuthResponse = AuthResult | AuthError;

export interface RefreshResult {
  success: true;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export type RefreshResponse = RefreshResult | AuthError;

export interface LogoutResult {
  success: true;
  message: string;
}

export interface PasswordResetRequestResult {
  success: true;
  message: string;
  token?: string; // Only in dev
}

export interface PasswordResetResult {
  success: true;
  message: string;
}

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

// ----------------------------------------------------------------------------
// AUTH SERVICE CLASS
// ----------------------------------------------------------------------------

export class AuthService {
  /**
   * Register a new user.
   */
  async register(
    input: RegisterInput,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<AuthResponse> {
    const { email, password, firstName, lastName } = input;

    // Validate password against policy
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        error: 'Password Policy Violation',
        message: 'Password does not meet security requirements',
        statusCode: 400,
        details: passwordValidation.errors,
      };
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Consume similar time to prevent timing attacks
      await hashPassword(password);
      return {
        success: false,
        error: 'Registration Failed',
        message: 'Unable to complete registration. Please try again or contact support.',
        statusCode: 400,
      };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Determine role
    const initialAdminEmail = process.env['INITIAL_ADMIN_EMAIL']?.toLowerCase();
    const userCount = await prisma.user.count();
    const isInitialAdmin = userCount === 0 && initialAdminEmail && email.toLowerCase() === initialAdminEmail;
    const role = isInitialAdmin ? 'admin' : 'viewer';

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role,
        permissions: [],
        isActive: true,
      },
    });

    // Generate tokens
    const tokens = await generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Create session
    await createSession(
      tokens.sessionId,
      user.id,
      ctx.ipAddress,
      ctx.userAgent
    ).catch((err) => logger?.error(err, 'Failed to create session'));

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

  /**
   * Authenticate user and return tokens.
   */
  async login(
    input: LoginInput,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<AuthResponse> {
    const { email, password } = input;

    // Step 1: Check if account is locked
    const lockoutError = await this.checkAccountLockout(email, ctx);
    if (lockoutError) return lockoutError;

    // Step 2: Find and validate user
    const userResult = await this.findAndValidateUser(email, password, ctx, logger);
    if (!userResult.success) return userResult.error;
    const user = userResult.user;

    // Step 3: Prepare for new session (reset attempts, invalidate old sessions)
    await this.prepareNewSession(user.id, email, logger);

    // Step 4: Issue tokens and create session
    const tokens = await this.issueTokensAndSession(user, ctx, logger);

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

  /**
   * Refresh tokens with rotation.
   */
  async refresh(
    refreshToken: string,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<RefreshResponse> {
    // Verify token
    const tokenData = await verifyRefreshTokenWithFamily(refreshToken);
    if (!tokenData) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
        statusCode: 401,
      };
    }

    const { userId, familyId } = tokenData;

    // Get user
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

    let newTokens: { accessToken: string; refreshToken: string; sessionId: string; familyId: string };

    if (familyId) {
      // Token has family - use rotation
      newTokens = await generateTokenPairWithFamily(
        { id: user.id, email: user.email, role: user.role },
        familyId
      );

      const rotationResult = await rotateToken(familyId, refreshToken, newTokens.refreshToken);

      if (!rotationResult.success) {
        await logAuditEvent({
          entityType: 'user',
          entityId: user.id,
          action: 'token_refresh',
          metadata: {
            error: rotationResult.error,
            theftDetected: rotationResult.theftDetected || false,
            familyId,
          },
          performedBy: user.id,
          ...ctx,
        }).catch((err) => logger?.error(err, 'Failed to log audit event'));

        if (rotationResult.theftDetected) {
          await terminateAllSessions(user.id).catch((err) =>
            logger?.error(err, 'Failed to terminate sessions after token theft')
          );
          await invalidateAllFamiliesForUser(user.id, 'token_theft_detected').catch((err) =>
            logger?.error(err, 'Failed to invalidate token families')
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
          message: rotationResult.error || 'Token refresh failed',
          statusCode: 401,
        };
      }
    } else {
      // Legacy token - create new family
      const legacyTokens = await generateTokenPair({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      const newFamily = await createTokenFamily(user.id, legacyTokens.refreshToken);

      newTokens = await generateTokenPairWithFamily(
        { id: user.id, email: user.email, role: user.role },
        newFamily.familyId
      );
    }

    // Log refresh
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

  /**
   * Logout user and invalidate tokens.
   */
  async logout(
    userId: string | undefined,
    sessionId: string | undefined,
    accessToken: string | undefined,
    refreshToken: string | undefined,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<LogoutResult> {
    if (sessionId && userId) {
      await terminateSession(sessionId, userId, accessToken, refreshToken);
    } else {
      // Fallback: blacklist tokens directly
      if (accessToken) {
        await blacklistToken(accessToken, ACCESS_TOKEN_TTL);
      }
      if (refreshToken) {
        await blacklistToken(refreshToken, REFRESH_TOKEN_TTL);
      }
    }

    // Log logout
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

  /**
   * Request password reset.
   */
  async requestPasswordReset(
    email: string,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
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

    // Log request
    await logAuditEvent({
      entityType: 'user',
      entityId: '00000000-0000-0000-0000-000000000000',
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

  /**
   * Reset password with token.
   */
  async resetPassword(
    token: string,
    newPassword: string,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<PasswordResetResult | AuthError> {
    const result = await resetPasswordLib(token, newPassword);

    if (!result.success) {
      return {
        success: false,
        error: 'Password Reset Failed',
        message: result.error || 'Failed to reset password',
        statusCode: 400,
      };
    }

    // Get user ID for logging
    const validation = await validateResetToken(token);

    // Log success
    await logAuditEvent({
      entityType: 'user',
      entityId: validation.userId || '00000000-0000-0000-0000-000000000000',
      action: 'password_reset_complete',
      performedBy: validation.userId || 'anonymous',
      ...ctx,
    }).catch((err) => logger?.error(err, 'Failed to log audit event'));

    // Invalidate sessions
    if (validation.userId) {
      await terminateAllSessions(validation.userId).catch((err) =>
        logger?.error(err, 'Failed to terminate sessions after password reset')
      );
    }

    return {
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  /**
   * Get current user info.
   */
  async getCurrentUser(userId: string): Promise<UserDTO | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        permissions: true,
        allowedLocationIds: true,
        allowedCostCenterIds: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return user as UserDTO | null;
  }

  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------

  /**
   * Check if account is locked out.
   */
  private async checkAccountLockout(
    email: string,
    ctx: AuthContext
  ): Promise<AuthError | null> {
    const lockoutStatus = await checkLockout(email);
    if (!lockoutStatus.locked) return null;

    await this.logFailedLogin(email, 'account_locked', ctx, lockoutStatus.reason);

    if (lockoutStatus.reason === 'permanent') {
      return {
        success: false,
        error: 'Account Locked',
        message: 'Account has been locked due to too many failed attempts. Contact an administrator to unlock.',
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

  /**
   * Find user and validate password.
   */
  private async findAndValidateUser(
    email: string,
    password: string,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<{ success: true; user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string } } | { success: false; error: AuthError }> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // User not found or inactive
    if (!user || !user.isActive || !user.passwordHash) {
      const newLockoutStatus = await recordFailedAttempt(email, 'user_not_found_or_inactive');
      await this.logFailedLogin(email, 'user_not_found_or_inactive', ctx);

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

    // Verify password
    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      const error = await this.handleInvalidPassword(user, email, ctx, logger);
      return { success: false, error };
    }

    return { success: true, user };
  }

  /**
   * Handle invalid password attempt.
   */
  private async handleInvalidPassword(
    user: { id: string; email: string },
    email: string,
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
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

  /**
   * Prepare for new session by resetting attempts and invalidating old sessions.
   */
  private async prepareNewSession(
    userId: string,
    email: string,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<void> {
    await resetAttempts(email);

    // Session fixation prevention
    await terminateAllSessions(userId).catch((err) =>
      logger?.error(err, 'Failed to terminate existing sessions during login')
    );
    await invalidateAllFamiliesForUser(userId, 'new_login').catch((err) =>
      logger?.error(err, 'Failed to invalidate token families during login')
    );

    // Update last login (fire and forget)
    prisma.user
      .update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      })
      .catch((err) => logger?.error(err, 'Failed to update last login'));
  }

  /**
   * Issue tokens and create session.
   */
  private async issueTokensAndSession(
    user: { id: string; email: string; role: string },
    ctx: AuthContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    const tokens = await generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const tokenFamily = await createTokenFamily(user.id, tokens.refreshToken);

    const tokensWithFamily = await generateTokenPairWithFamily(
      { id: user.id, email: user.email, role: user.role },
      tokenFamily.familyId
    );

    await createSession(
      tokensWithFamily.sessionId,
      user.id,
      ctx.ipAddress,
      ctx.userAgent
    ).catch((err) => logger?.error(err, 'Failed to create session'));

    await logAuditEvent({
      entityType: 'user',
      entityId: user.id,
      action: 'login',
      metadata: {
        email: user.email,
        sessionId: tokensWithFamily.sessionId,
        tokenFamilyId: tokenFamily.familyId,
      },
      performedBy: user.id,
      ...ctx,
    }).catch((err) => logger?.error(err, 'Failed to log audit event'));

    return {
      accessToken: tokensWithFamily.accessToken,
      refreshToken: tokensWithFamily.refreshToken,
      sessionId: tokensWithFamily.sessionId,
    };
  }

  private async logFailedLogin(
    email: string,
    reason: string,
    ctx: AuthContext,
    lockoutReason?: string
  ): Promise<void> {
    await logAuditEvent({
      entityType: 'user',
      entityId: '00000000-0000-0000-0000-000000000000',
      action: 'login_failed',
      metadata: { email: email.toLowerCase(), reason, lockoutReason },
      performedBy: 'anonymous',
      ...ctx,
    }).catch(() => {
      // Silently ignore audit failures for failed logins
    });
  }
}

// Export singleton instance
export const authService = new AuthService();
