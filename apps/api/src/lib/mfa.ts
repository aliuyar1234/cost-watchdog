/**
 * Multi-Factor Authentication Library
 *
 * Provides TOTP-based MFA for admin accounts using otplib.
 * Includes backup code generation, rate limiting, and secure storage.
 */

import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import { prisma } from './db.js';
import { encrypt, decrypt } from './field-encryption.js';
import { redis } from './redis.js';
// Types imported from Prisma are available via the prisma client

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// TOTP configuration
const APP_NAME = 'CostWatchdog';
const TOTP_WINDOW = 1; // Allow 1 step (30 seconds) of drift
const TOTP_STEP = 30; // 30 second intervals

// Rate limiting for MFA attempts
const MFA_RATE_LIMIT_MAX = 5;
const MFA_RATE_LIMIT_WINDOW_SECONDS = 15 * 60; // 15 minutes

// Backup codes
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MfaEnrollmentResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
  enrollmentId: string;
}

export interface MfaVerificationResult {
  success: boolean;
  error?: string;
  remainingAttempts?: number;
  lockoutUntil?: Date;
}

export interface BackupCodeUseResult {
  success: boolean;
  error?: string;
  remainingCodes?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOTP CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Configure TOTP settings
authenticator.options = {
  window: TOTP_WINDOW,
  step: TOTP_STEP,
};

// ═══════════════════════════════════════════════════════════════════════════
// SECRET GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a new TOTP secret.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret(20); // 160 bits
}

/**
 * Generate an otpauth URL for QR code scanning.
 */
export function generateOtpauthUrl(secret: string, userEmail: string): string {
  return authenticator.keyuri(userEmail, APP_NAME, secret);
}

/**
 * Generate a simple text-based "QR code" URL.
 * In production, this should use a QR code library.
 */
export function generateQrCodeDataUrl(otpauthUrl: string): string {
  // For now, return a placeholder. In production, use qrcode library.
  // The frontend should generate the QR code from the otpauthUrl.
  return `data:text/plain;base64,${Buffer.from(otpauthUrl).toString('base64')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP CODES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a set of backup codes.
 */
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate alphanumeric code (uppercase for readability)
    const bytes = randomBytes(BACKUP_CODE_LENGTH / 2);
    const code = bytes.toString('hex').toUpperCase().slice(0, BACKUP_CODE_LENGTH);
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Hash backup codes for secure storage.
 */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashed: string[] = [];
  for (const code of codes) {
    // Normalize: remove dashes and lowercase
    const normalized = code.replace(/-/g, '').toLowerCase();
    const hashedCode = await hash(normalized);
    hashed.push(hashedCode);
  }
  return hashed;
}

/**
 * Verify a backup code against hashed codes.
 */
export async function verifyBackupCode(code: string, hashedCodes: string[]): Promise<number | null> {
  const normalized = code.replace(/-/g, '').toLowerCase();

  for (let i = 0; i < hashedCodes.length; i++) {
    const hashedCode = hashedCodes[i];
    if (!hashedCode) continue;

    try {
      const isValid = await verify(hashedCode, normalized);
      if (isValid) {
        return i; // Return index of matched code
      }
    } catch {
      // Invalid hash format, continue
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check MFA rate limit for a user.
 */
export async function checkMfaRateLimit(userId: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  lockoutUntil?: Date;
}> {
  const key = `mfa:attempts:${userId}`;

  try {
    const attempts = await redis.get(key);
    const count = attempts ? parseInt(attempts, 10) : 0;

    if (count >= MFA_RATE_LIMIT_MAX) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + ttl * 1000),
      };
    }

    return {
      allowed: true,
      remainingAttempts: MFA_RATE_LIMIT_MAX - count,
    };
  } catch {
    // If Redis fails, allow the attempt
    return { allowed: true, remainingAttempts: MFA_RATE_LIMIT_MAX };
  }
}

/**
 * Record an MFA attempt.
 */
export async function recordMfaAttempt(userId: string, success: boolean): Promise<void> {
  if (success) {
    // Clear attempts on success
    const key = `mfa:attempts:${userId}`;
    await redis.del(key).catch(() => {});
    return;
  }

  const key = `mfa:attempts:${userId}`;

  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, MFA_RATE_LIMIT_WINDOW_SECONDS);
    await multi.exec();
  } catch {
    // Ignore Redis errors for rate limiting
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MFA ENROLLMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start MFA enrollment for a user.
 * Creates a pending enrollment that must be verified.
 */
export async function startMfaEnrollment(user: { id: string; email: string }): Promise<MfaEnrollmentResult> {
  // Check if user already has active MFA
  const existing = await prisma.mfaEnrollment.findFirst({
    where: { userId: user.id, verified: true },
  });

  if (existing) {
    throw new Error('MFA is already enabled for this account');
  }

  // Generate new secret
  const secret = generateTotpSecret();
  const otpauthUrl = generateOtpauthUrl(secret, user.email);
  const qrCodeDataUrl = generateQrCodeDataUrl(otpauthUrl);

  // Generate backup codes
  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = await hashBackupCodes(backupCodes);

  // Encrypt secret for storage
  const encryptedSecret = encrypt(secret);

  // Delete any existing unverified enrollments
  await prisma.mfaEnrollment.deleteMany({
    where: { userId: user.id, verified: false },
  });

  // Create pending enrollment
  const enrollment = await prisma.mfaEnrollment.create({
    data: {
      userId: user.id,
      method: 'totp',
      secretEncrypted: encryptedSecret,
      backupCodesHash: hashedBackupCodes,
      backupCodesUsed: 0,
      verified: false, // Not active until verified
    },
  });

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
    backupCodes,
    enrollmentId: enrollment.id,
  };
}

/**
 * Verify MFA enrollment by validating a TOTP code.
 * This activates the enrollment.
 */
export async function verifyMfaEnrollment(
  userId: string,
  enrollmentId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: {
      id: enrollmentId,
      userId,
      verified: false,
    },
  });

  if (!enrollment) {
    return { success: false, error: 'Enrollment not found or already activated' };
  }

  // Decrypt secret
  const secret = decrypt(enrollment.secretEncrypted);

  // Verify the code
  const isValid = authenticator.verify({ token: code, secret });

  if (!isValid) {
    return { success: false, error: 'Invalid verification code' };
  }

  // Activate enrollment
  await prisma.$transaction([
    // Delete any existing verified enrollments
    prisma.mfaEnrollment.deleteMany({
      where: { userId, verified: true },
    }),
    // Activate this enrollment
    prisma.mfaEnrollment.update({
      where: { id: enrollmentId },
      data: { verified: true, verifiedAt: new Date() },
    }),
    // Mark user as MFA enrolled
    prisma.user.update({
      where: { id: userId },
      data: { mfaRequired: true },
    }),
  ]);

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// MFA VERIFICATION (Login)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify a TOTP code for login.
 */
export async function verifyMfaCode(
  userId: string,
  code: string
): Promise<MfaVerificationResult> {
  // Check rate limit
  const rateLimit = await checkMfaRateLimit(userId);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'Too many MFA attempts. Please try again later.',
      remainingAttempts: 0,
      lockoutUntil: rateLimit.lockoutUntil,
    };
  }

  // Get active enrollment
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });

  if (!enrollment) {
    return { success: false, error: 'MFA not enrolled' };
  }

  // Decrypt secret
  const secret = decrypt(enrollment.secretEncrypted);

  // Verify the code
  const isValid = authenticator.verify({ token: code, secret });

  // Record attempt
  await recordMfaAttempt(userId, isValid);

  if (!isValid) {
    const newRateLimit = await checkMfaRateLimit(userId);
    return {
      success: false,
      error: 'Invalid MFA code',
      remainingAttempts: newRateLimit.remainingAttempts,
    };
  }

  // Update last used time
  await prisma.mfaEnrollment.update({
    where: { id: enrollment.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {}); // Fire and forget

  return { success: true };
}

/**
 * Use a backup code for login.
 * Note: backupCodesUsed is a simple counter, so we track which codes are used via the counter
 */
export async function useBackupCode(
  userId: string,
  code: string
): Promise<BackupCodeUseResult> {
  // Check rate limit
  const rateLimit = await checkMfaRateLimit(userId);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'Too many MFA attempts. Please try again later.',
    };
  }

  // Get active enrollment
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });

  if (!enrollment) {
    return { success: false, error: 'MFA not enrolled' };
  }

  // Check if all backup codes have been used
  if (enrollment.backupCodesUsed >= enrollment.backupCodesHash.length) {
    await recordMfaAttempt(userId, false);
    return { success: false, error: 'All backup codes have been used' };
  }

  // Verify backup code against any remaining code
  const codeIndex = await verifyBackupCode(code, enrollment.backupCodesHash);

  if (codeIndex === null) {
    await recordMfaAttempt(userId, false);
    return { success: false, error: 'Invalid backup code' };
  }

  // Increment used counter and update last used time
  await prisma.mfaEnrollment.update({
    where: { id: enrollment.id },
    data: {
      backupCodesUsed: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });

  // Clear rate limit on success
  await recordMfaAttempt(userId, true);

  const remainingCodes = enrollment.backupCodesHash.length - enrollment.backupCodesUsed - 1;

  return {
    success: true,
    remainingCodes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MFA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Disable MFA for a user.
 * Requires re-authentication (password) which should be checked before calling.
 */
export async function disableMfa(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.mfaEnrollment.deleteMany({
      where: { userId, verified: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { mfaRequired: false },
    }),
  ]);

  // Clear any rate limit data
  await redis.del(`mfa:attempts:${userId}`).catch(() => {});
}

/**
 * Regenerate backup codes for a user.
 */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });

  if (!enrollment) {
    throw new Error('MFA not enrolled');
  }

  // Generate new backup codes
  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = await hashBackupCodes(backupCodes);

  // Update enrollment
  await prisma.mfaEnrollment.update({
    where: { id: enrollment.id },
    data: {
      backupCodesHash: hashedBackupCodes,
      backupCodesUsed: 0,
    },
  });

  return backupCodes;
}

/**
 * Check if a user has MFA enabled.
 */
export async function isMfaEnabled(userId: string): Promise<boolean> {
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });

  return enrollment !== null;
}

/**
 * Get MFA status for a user.
 */
export async function getMfaStatus(userId: string): Promise<{
  enabled: boolean;
  backupCodesRemaining: number;
  enrolledAt?: Date;
}> {
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });

  if (!enrollment) {
    return { enabled: false, backupCodesRemaining: 0 };
  }

  return {
    enabled: true,
    backupCodesRemaining: enrollment.backupCodesHash.length - enrollment.backupCodesUsed,
    enrolledAt: enrollment.verifiedAt || undefined,
  };
}

/**
 * Check if MFA is required for a user role.
 */
export function isMfaRequiredForRole(role: string): boolean {
  return role === 'admin';
}
