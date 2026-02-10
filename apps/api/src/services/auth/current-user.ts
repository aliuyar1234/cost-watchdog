import { prisma } from '../../lib/db.js';
import type { UserDTO } from './types.js';

export async function getCurrentUser(userId: string): Promise<UserDTO | null> {
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
