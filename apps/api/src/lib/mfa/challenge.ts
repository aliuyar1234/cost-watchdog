import { prisma } from '../db.js';
import { decrypt } from '../field-encryption.js';
import { verifyBackupCode } from './backup-codes.js';
import { verifyTotpCode } from './otp.js';
import { checkMfaRateLimit, recordMfaAttempt } from './rate-limit.js';
import type { BackupCodeUseResult, MfaVerificationResult } from './types.js';

export async function verifyMfaCode(userId: string, code: string): Promise<MfaVerificationResult> {
  const rateLimit = await checkMfaRateLimit(userId);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'Too many MFA attempts. Please try again later.',
      remainingAttempts: 0,
      lockoutUntil: rateLimit.lockoutUntil,
    };
  }

  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });
  if (!enrollment) {
    return { success: false, error: 'MFA not enrolled' };
  }

  const secret = decrypt(enrollment.secretEncrypted);
  const isValid = verifyTotpCode(secret, code);
  await recordMfaAttempt(userId, isValid);

  if (!isValid) {
    const newRateLimit = await checkMfaRateLimit(userId);
    return {
      success: false,
      error: 'Invalid MFA code',
      remainingAttempts: newRateLimit.remainingAttempts,
    };
  }

  await prisma.mfaEnrollment
    .update({
      where: { id: enrollment.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return { success: true };
}

export async function useBackupCode(userId: string, code: string): Promise<BackupCodeUseResult> {
  const rateLimit = await checkMfaRateLimit(userId);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'Too many MFA attempts. Please try again later.',
    };
  }

  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });
  if (!enrollment) {
    return { success: false, error: 'MFA not enrolled' };
  }

  if (enrollment.backupCodesUsed >= enrollment.backupCodesHash.length) {
    await recordMfaAttempt(userId, false);
    return { success: false, error: 'All backup codes have been used' };
  }

  const codeIndex = await verifyBackupCode(code, enrollment.backupCodesHash);
  if (codeIndex === null) {
    await recordMfaAttempt(userId, false);
    return { success: false, error: 'Invalid backup code' };
  }

  await prisma.mfaEnrollment.update({
    where: { id: enrollment.id },
    data: {
      backupCodesUsed: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });

  await recordMfaAttempt(userId, true);

  return {
    success: true,
    remainingCodes: enrollment.backupCodesHash.length - enrollment.backupCodesUsed - 1,
  };
}
