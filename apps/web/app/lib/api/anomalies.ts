/**
 * Anomalies API
 */

import { fetchApi, buildQueryString } from './client.js';

export interface Anomaly {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'new' | 'acknowledged' | 'resolved' | 'false_positive';
  message: string;
  details: Record<string, unknown>;
  isBackfill: boolean;
  detectedAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolution: string | null;
  costRecord: {
    id: string;
    costType: string;
    amount: number;
    quantity: number | null;
    unit: string | null;
    pricePerUnit: number | null;
    periodStart: string;
    periodEnd: string;
    invoiceNumber: string | null;
    location: {
      id: string;
      name: string;
      type: string;
    } | null;
    supplier: {
      id: string;
      name: string;
      category: string;
    } | null;
  } | null;
}

export interface AnomaliesResponse {
  data: Anomaly[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AnomalyStats {
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  newLast24h: number;
}

export const anomaliesApi = {
  list: (params?: {
    status?: string;
    severity?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }) => fetchApi<AnomaliesResponse>(`/anomalies${buildQueryString(params)}`),

  get: (id: string) => fetchApi<Anomaly>(`/anomalies/${id}`),

  stats: () => fetchApi<AnomalyStats>('/anomalies/stats'),

  acknowledge: (id: string, resolution?: string) =>
    fetchApi<Anomaly>(`/anomalies/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),

  resolve: (id: string, resolution?: string) =>
    fetchApi<Anomaly>(`/anomalies/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),

  markFalsePositive: (id: string, resolution?: string) =>
    fetchApi<Anomaly>(`/anomalies/${id}/false-positive`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),

  updateStatus: (id: string, status: string, resolution?: string) =>
    fetchApi<Anomaly>(`/anomalies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolution }),
    }),
};
