import { prisma } from '../db.js';

interface UserAdminStatus {
  role: string;
  isActive: boolean;
  deletedAt: Date | null;
}

function isActiveAdmin(user: UserAdminStatus | null): user is UserAdminStatus {
  return Boolean(user && user.role === 'admin' && user.isActive && user.deletedAt === null);
}

export async function getActiveAdminCount(): Promise<number> {
  return prisma.user.count({
    where: {
      role: 'admin',
      isActive: true,
      deletedAt: null,
    },
  });
}

export async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, deletedAt: true },
  });

  if (!isActiveAdmin(user)) {
    return false;
  }

  const activeAdminCount = await getActiveAdminCount();
  return activeAdminCount === 1;
}
