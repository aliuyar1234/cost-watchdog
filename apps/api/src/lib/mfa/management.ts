import { prisma } from '../db.js';
import { generateBackupCodes, hashBackupCodes } from './backup-codes.js';
import { clearMfaRateLimit } from './rate-limit.js';

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

  await clearMfaRateLimit(userId);
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });
  if (!enrollment) {
    throw new Error('MFA not enrolled');
  }

  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = await hashBackupCodes(backupCodes);

  await prisma.mfaEnrollment.update({
    where: { id: enrollment.id },
    data: {
      backupCodesHash: hashedBackupCodes,
      backupCodesUsed: 0,
    },
  });

  return backupCodes;
}

export async function isMfaEnabled(userId: string): Promise<boolean> {
  const enrollment = await prisma.mfaEnrollment.findFirst({
    where: { userId, verified: true },
  });
  return enrollment !== null;
}

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

export function isMfaRequiredForRole(role: string): boolean {
  return role === 'admin';
}
