import { prisma } from '../db.js';
import { generateAnonymousEmail } from './anonymization.js';
import { ANONYMOUS_FIRST_NAME, ANONYMOUS_LAST_NAME } from './constants.js';

export async function removeUserPii(userId: string): Promise<void> {
  const anonymousEmail = generateAnonymousEmail(userId);
  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymousEmail,
        firstName: ANONYMOUS_FIRST_NAME,
        lastName: ANONYMOUS_LAST_NAME,
        passwordHash: null,
        ssoSubject: null,
        avatarUrl: null,
        permissions: [],
        allowedLocationIds: [],
        allowedCostCenterIds: [],
        isActive: false,
        deletedAt,
      },
    }),
    prisma.mfaEnrollment.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.apiKey.updateMany({
      where: { createdById: userId },
      data: {
        isActive: false,
        revokedAt: deletedAt,
      },
    }),
  ]);
}
