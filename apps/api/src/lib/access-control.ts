import { prisma } from './db.js';

/**
 * User access restrictions based on allowed locations and cost centers.
 */
export interface UserRestrictions {
  allowedLocationIds: string[];
  allowedCostCenterIds: string[];
  hasRestrictions: boolean;
}

/**
 * Get user's allowed location and cost center IDs from database.
 * Admins and managers have unrestricted access (empty arrays = all allowed).
 */
export async function getUserRestrictions(userId: string): Promise<UserRestrictions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      allowedLocationIds: true,
      allowedCostCenterIds: true,
    },
  });

  if (!user) {
    return { allowedLocationIds: [], allowedCostCenterIds: [], hasRestrictions: true };
  }

  // Admins and managers have unrestricted access
  if (user.role === 'admin' || user.role === 'manager') {
    return { allowedLocationIds: [], allowedCostCenterIds: [], hasRestrictions: false };
  }

  const hasRestrictions = user.allowedLocationIds.length > 0 || user.allowedCostCenterIds.length > 0;

  return {
    allowedLocationIds: user.allowedLocationIds,
    allowedCostCenterIds: user.allowedCostCenterIds,
    hasRestrictions,
  };
}

/**
 * Build location/cost center filter for Prisma queries.
 * Returns filter object to spread into where clause.
 */
export function buildAccessFilter(restrictions: UserRestrictions): Record<string, unknown> {
  if (!restrictions.hasRestrictions) {
    return {};
  }

  const filters: unknown[] = [];

  if (restrictions.allowedLocationIds.length > 0) {
    filters.push({ locationId: { in: restrictions.allowedLocationIds } });
  }

  if (restrictions.allowedCostCenterIds.length > 0) {
    filters.push({ costCenterId: { in: restrictions.allowedCostCenterIds } });
  }

  // If both are set, user can access records matching either
  if (filters.length > 1) {
    return { OR: filters };
  }

  return filters[0] as Record<string, unknown> || {};
}

/**
 * Build access filter for nested relations (e.g., anomaly -> costRecord).
 * Use when filtering parent records by related child's location/costCenter.
 */
export function buildNestedAccessFilter(
  restrictions: UserRestrictions,
  relationPath: string
): Record<string, unknown> {
  if (!restrictions.hasRestrictions) {
    return {};
  }

  const accessFilter = buildAccessFilter(restrictions);
  return { [relationPath]: accessFilter };
}
