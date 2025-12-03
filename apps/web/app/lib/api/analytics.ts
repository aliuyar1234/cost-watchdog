/**
 * Analytics API
 */

import { fetchApi, buildQueryString } from './client.js';

export interface DashboardData {
  year: number;
  totals: {
    yearToDate: number;
    yearToDateChange: number;
    currentMonth: number;
    currentMonthChange: number;
    recordCount: number;
  };
  anomalies: {
    open: number;
    critical: number;
  };
  documents: {
    total: number;
    pending: number;
  };
}

export interface TrendDataPoint {
  period: string;
  year: number;
  month: number;
  amount: number;
  recordCount: number;
}

export interface BreakdownItem {
  costType?: string;
  locationId?: string;
  locationName?: string;
  locationType?: string;
  supplierId?: string;
  supplierName?: string;
  supplierCategory?: string;
  amount: number;
  recordCount: number;
  percentage: number;
}

export interface ComparisonData {
  year: number;
  months: {
    month: number;
    currentYear: number;
    previousYear: number;
    change: number;
  }[];
}

export const analyticsApi = {
  dashboard: (year?: number) =>
    fetchApi<DashboardData>(`/analytics/dashboard${buildQueryString({ year })}`),

  trends: (params?: {
    months?: number;
    costType?: string;
    locationId?: string;
    supplierId?: string;
  }) => fetchApi<{ data: TrendDataPoint[] }>(`/analytics/trends${buildQueryString(params)}`),

  byCostType: (params?: { year?: number; month?: number; limit?: number }) =>
    fetchApi<{ data: BreakdownItem[] }>(`/analytics/by-cost-type${buildQueryString(params)}`),

  byLocation: (params?: { year?: number; month?: number; limit?: number }) =>
    fetchApi<{ data: BreakdownItem[] }>(`/analytics/by-location${buildQueryString(params)}`),

  bySupplier: (params?: { year?: number; month?: number; limit?: number }) =>
    fetchApi<{ data: BreakdownItem[] }>(`/analytics/by-supplier${buildQueryString(params)}`),

  comparison: (params?: { year?: number; costType?: string }) =>
    fetchApi<ComparisonData>(`/analytics/comparison${buildQueryString(params)}`),
};
