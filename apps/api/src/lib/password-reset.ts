/**
 * Password Reset Library
 *
 * Provides secure password reset functionality with:
 * - Time-limited tokens (1 hour)
 * - Single-use tokens
 * - Rate limiting (3/email/hour, 10/IP/hour)
 */

import { randomBytes, createHash } from 'crypto';
import { prisma } from './db.js';
import { redis } from './redis.js';
import { validatePassword } from './password-policy.js';
import { verifyPassword, hashPassword } from './auth.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TOKEN_LENGTH = 32;
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_EMAIL_COUNT = 3;
const RATE_LIMIT_EMAIL_WINDOW = 60 * 60; // 1 hour in seconds
const RATE_LIMIT_IP_COUNT = 10;
const RATE_LIMIT_IP_WINDOW = 60 * 60; // 1 hour in seconds

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a secure password reset token.
 */
export function generateResetToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Hash a reset token for storage.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check rate limit for password reset requests.
 */
export async function checkResetRateLimit(
  email: string,
  ipAddress: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const normalizedEmail = email.toLowerCase();
  const emailKey = `password_reset:email:${normalizedEmail}`;
  const ipKey = `password_reset:ip:${ipAddress}`;

  const [emailCount, ipCount] = await Promise.all([
    redis.get(emailKey),
    redis.get(ipKey),
  ]);

  const currentEmailCount = emailCount ? parseInt(emailCount, 10) : 0;
  const currentIpCount = ipCount ? parseInt(ipCount, 10) : 0;

  if (currentEmailCount >= RATE_LIMIT_EMAIL_COUNT) {
    const ttl = await redis.ttl(emailKey);
    return {
      allowed: false,
      reason: 'Too many password reset requests for this email',
      retryAfter: ttl > 0 ? ttl : RATE_LIMIT_EMAIL_WINDOW,
    };
  }

  if (currentIpCount >= RATE_LIMIT_IP_COUNT) {
    const ttl = await redis.ttl(ipKey);
    return {
      allowed: false,
      reason: 'Too many password reset requests from this IP',
      retryAfter: ttl > 0 ? ttl : RATE_LIMIT_IP_WINDOW,
    };
  }

  return { allowed: true };
}

/**
 * Record a password reset request for rate limiting.
 */
export async function recordResetRequest(email: string, ipAddress: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const emailKey = `password_reset:email:${normalizedEmail}`;
  const ipKey = `password_reset:ip:${ipAddress}`;

  await Promise.all([
    redis.incr(emailKey).then(() => redis.expire(emailKey, RATE_LIMIT_EMAIL_WINDOW)),
    redis.incr(ipKey).then(() => redis.expire(ipKey, RATE_LIMIT_IP_WINDOW)),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD RESET FLOW
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateResetResult {
  success: boolean;
  token?: string;
  error?: string;
  retryAfter?: number;
}

/**
 * Create a password reset token for a user.
 * Returns the token if successful (to be sent via email).
 *
 * Note: Always returns success=true even if email doesn't exist
 * to prevent user enumeration attacks.
 */
export async function createPasswordResetToken(
  email: string,
  ipAddress: string
): Promise<CreateResetResult> {
  const normalizedEmail = email.toLowerCase();

  // Check rate limit
  const rateLimit = await checkResetRateLimit(normalizedEmail, ipAddress);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: rateLimit.reason,
      retryAfter: rateLimit.retryAfter,
    };
  }

  // Record the request for rate limiting
  await recordResetRequest(normalizedEmail, ipAddress);

  // Find user (silently succeed if not found to prevent enumeration)
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, isActive: true, deletedAt: true },
  });

  if (!user || !user.isActive || user.deletedAt) {
    // Return success but no token (don't reveal user existence)
    return { success: true };
  }

  // Invalidate any existing tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
    data: {
      usedAt: new Date(), // Mark as used to invalidate
    },
  });

  // Generate new token
  const token = generateResetToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Store token
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  return { success: true, token };
}

export interface ValidateResetResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

/**
 * Validate a password reset token.
 */
export async function validateResetToken(token: string): Promise<ValidateResetResult> {
  const tokenHash = hashToken(token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, isActive: true, deletedAt: true },
      },
    },
  });

  if (!resetToken) {
    return { valid: false, error: 'Invalid or expired reset token' };
  }

  if (resetToken.usedAt) {
    return { valid: false, error: 'Reset token has already been used' };
  }

  if (resetToken.expiresAt < new Date()) {
    return { valid: false, error: 'Reset token has expired' };
  }

  if (!resetToken.user || !resetToken.user.isActive || resetToken.user.deletedAt) {
    return { valid: false, error: 'User account is not active' };
  }

  return { valid: true, userId: resetToken.userId };
}

export interface ResetPasswordResult {
  success: boolean;
  error?: string;
}

/**
 * Reset a user's password using a valid token.
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  // Validate token
  const validation = await validateResetToken(token);
  if (!validation.valid || !validation.userId) {
    return { success: false, error: validation.error };
  }

  // Validate new password
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.errors?.join(', ') || 'Password does not meet requirements',
    };
  }

  const tokenHash = hashToken(token);

  // Get current password to prevent reuse
  const user = await prisma.user.findUnique({
    where: { id: validation.userId },
    select: { passwordHash: true },
  });

  if (user?.passwordHash) {
    const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      return { success: false, error: 'New password cannot be the same as the current password' };
    }
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password and mark token as used in a transaction
  await prisma.$transaction([
    prisma.user.update({
      where: { id: validation.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    }),
  ]);

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up expired password reset tokens.
 * Should be run periodically (e.g., daily).
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null } },
      ],
    },
  });
  return result.count;
}
