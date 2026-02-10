import { prisma } from '../db.js';
import { decrypt, encrypt } from '../field-encryption.js';
import { generateBackupCodes, hashBackupCodes } from './backup-codes.js';
import {
  generateOtpauthUrl,
  generateQrCodeDataUrl,
  generateTotpSecret,
  verifyTotpCode,
} from './otp.js';
import type { MfaEnrollmentResult } from './types.js';

export async function startMfaEnrollment(user: {
  id: string;
  email: string;
}): Promise<MfaEnrollmentResult> {
  const existing = await prisma.mfaEnrollment.findFirst({
    where: { userId: user.id, verified: true },
  });
  if (existing) {
    throw new Error('MFA is already enabled for this account');
  }

  const secret = generateTotpSecret();
  const otpauthUrl = generateOtpauthUrl(secret, user.email);
  const qrCodeDataUrl = generateQrCodeDataUrl(otpauthUrl);
  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = await hashBackupCodes(backupCodes);

  await prisma.mfaEnrollment.deleteMany({
    where: { userId: user.id, verified: false },
  });

  const enrollment = await prisma.mfaEnrollment.create({
    data: {
      userId: user.id,
      method: 'totp',
      secretEncrypted: encrypt(secret),
      backupCodesHash: hashedBackupCodes,
      backupCodesUsed: 0,
      verified: false,
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

export async function verifyMfaEnrollment(
  userId: string,
  enrollmentId: string,
  code: string,
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

  const secret = decrypt(enrollment.secretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    return { success: false, error: 'Invalid verification code' };
  }

  await prisma.$transaction([
    prisma.mfaEnrollment.deleteMany({
      where: { userId, verified: true },
    }),
    prisma.mfaEnrollment.update({
      where: { id: enrollmentId },
      data: { verified: true, verifiedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { mfaRequired: true },
    }),
  ]);

  return { success: true };
}
