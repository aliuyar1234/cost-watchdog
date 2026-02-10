import type { Prisma } from '@prisma/client';

export type UserRole = 'admin' | 'manager' | 'analyst' | 'viewer' | 'auditor';

export interface UserQuery {
  role?: UserRole;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface UserIdParams {
  id: string;
}

export interface CreateUserBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  allowedLocationIds?: string[];
  allowedCostCenterIds?: string[];
}

export interface UpdateUserBody {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
  allowedLocationIds?: string[];
  allowedCostCenterIds?: string[];
}

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  allowedLocationIds: string[];
  allowedCostCenterIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  allowedLocationIds: true,
  allowedCostCenterIds: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function requireAdmin(userRole: string): boolean {
  return userRole === 'admin';
}

export function formatUser(user: SelectedUser): UserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    allowedLocationIds: user.allowedLocationIds,
    allowedCostCenterIds: user.allowedCostCenterIds,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
