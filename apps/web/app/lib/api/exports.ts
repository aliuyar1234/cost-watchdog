/**
 * Exports API
 */

import { fetchApi, API_URL } from './client.js';

export interface MonthlyReport {
  period: { year: number; month: number };
  summary: {
    totalAmount: number;
    previousMonth: number;
    changePercent: number;
    anomalyCount: number;
  };
  byCostType: { costType: string; amount: number; recordCount: number }[];
  byLocation: { locationId: string; locationName: string; amount: number }[];
  bySupplier: { supplierId: string; supplierName: string; amount: number }[];
  generatedAt: string;
}

export const exportsApi = {
  costRecordsCsv: (params?: {
    year?: number;
    month?: number;
    costType?: string;
    locationId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('format', 'csv');
    if (params?.year) searchParams.set('year', String(params.year));
    if (params?.month) searchParams.set('month', String(params.month));
    if (params?.costType) searchParams.set('costType', params.costType);
    if (params?.locationId) searchParams.set('locationId', params.locationId);
    return `${API_URL}/exports/cost-records?${searchParams.toString()}`;
  },

  anomaliesCsv: (params?: { status?: string; severity?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('format', 'csv');
    if (params?.status) searchParams.set('status', params.status);
    if (params?.severity) searchParams.set('severity', params.severity);
    return `${API_URL}/exports/anomalies?${searchParams.toString()}`;
  },

  monthlyReport: (year: number, month: number) =>
    fetchApi<MonthlyReport>(`/exports/monthly-report?year=${year}&month=${month}`),
};
