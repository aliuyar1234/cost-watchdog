'use client';

import { useCallback, useEffect, useState } from 'react';
import { anomaliesApi, type Anomaly, type AnomalyStats } from '../../lib/api';
import type { AnomalyPagination, SeverityFilter, StatusFilter } from './types';

const INITIAL_PAGINATION: AnomalyPagination = {
  total: 0,
  limit: 20,
  offset: 0,
  hasMore: false,
};

type AnomalyAction = 'acknowledge' | 'resolve' | 'false_positive';

export function useAnomalies() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [pagination, setPagination] = useState<AnomalyPagination>(INITIAL_PAGINATION);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [anomaliesResponse, statsResponse] = await Promise.all([
        anomaliesApi.list({
          status: statusFilter === 'all' ? undefined : statusFilter,
          severity: severityFilter === 'all' ? undefined : severityFilter,
          limit: pagination.limit,
          offset: pagination.offset,
        }),
        anomaliesApi.stats(),
      ]);

      setAnomalies(anomaliesResponse.data);
      setPagination(anomaliesResponse.pagination);
      setStats(statsResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Anomalien konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit, pagination.offset, severityFilter, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    void fetchData();
  }, [fetchData]);

  const updateStatusFilter = useCallback((next: StatusFilter) => {
    setStatusFilter(next);
    setPagination((previous) => ({ ...previous, offset: 0 }));
  }, []);

  const updateSeverityFilter = useCallback((next: SeverityFilter) => {
    setSeverityFilter(next);
    setPagination((previous) => ({ ...previous, offset: 0 }));
  }, []);

  const runAction = useCallback(
    async (id: string, action: AnomalyAction) => {
      try {
        setError(null);
        switch (action) {
          case 'acknowledge':
            await anomaliesApi.acknowledge(id);
            break;
          case 'resolve':
            await anomaliesApi.resolve(id);
            break;
          case 'false_positive':
            await anomaliesApi.markFalsePositive(id);
            break;
        }
        await fetchData();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen.');
      }
    },
    [fetchData],
  );

  const goToPreviousPage = useCallback(() => {
    setPagination((previous) => ({
      ...previous,
      offset: Math.max(0, previous.offset - previous.limit),
    }));
  }, []);

  const goToNextPage = useCallback(() => {
    setPagination((previous) => ({ ...previous, offset: previous.offset + previous.limit }));
  }, []);

  return {
    anomalies,
    stats,
    isLoading,
    error,
    statusFilter,
    severityFilter,
    pagination,
    fetchData,
    updateStatusFilter,
    updateSeverityFilter,
    runAction,
    goToPreviousPage,
    goToNextPage,
  };
}
