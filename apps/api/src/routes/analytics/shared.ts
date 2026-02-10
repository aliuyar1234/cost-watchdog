import { buildAccessFilter, getUserRestrictions } from '../../lib/access-control.js';
import { TtlCache } from '../../lib/ttl-cache.js';

export interface DashboardQuery {
  year?: string;
  locationId?: string;
}

export interface TrendsQuery {
  months?: string;
  costType?: string;
  locationId?: string;
  supplierId?: string;
}

export interface BreakdownQuery {
  year?: string;
  month?: string;
  limit?: string;
}

export interface ComparisonQuery {
  year?: string;
  costType?: string;
}

const ANALYTICS_CACHE_TTL_MS = 30 * 1000;
export const ANALYTICS_CACHE_CONTROL = 'private, max-age=30';
export const analyticsCache = new TtlCache<unknown>(ANALYTICS_CACHE_TTL_MS, 500);

export async function getAnalyticsAccess(userId: string): Promise<{
  accessFilter: Record<string, unknown>;
  anomalyAccessFilter: Record<string, unknown>;
}> {
  const restrictions = await getUserRestrictions(userId);
  const accessFilter = buildAccessFilter(restrictions);
  const anomalyAccessFilter = restrictions.hasRestrictions ? { costRecord: accessFilter } : {};

  return { accessFilter, anomalyAccessFilter };
}
