'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  anomaliesApi,
  analyticsApi,
  documentsApi,
  type Anomaly,
  type AnomalyStats,
  type BreakdownItem,
  type ComparisonData,
  type DashboardData,
  type Document,
  type TrendDataPoint,
} from '../../lib/api';

export function useDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [anomalyStats, setAnomalyStats] = useState<AnomalyStats | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<Document[]>([]);
  const [criticalAnomalies, setCriticalAnomalies] = useState<Anomaly[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [costTypeData, setCostTypeData] = useState<BreakdownItem[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const [docsResponse, anomalyStatsResponse, anomaliesResponse] = await Promise.all([
        documentsApi.list({ limit: 5 }),
        anomaliesApi.stats(),
        anomaliesApi.list({ status: 'new', severity: 'critical', limit: 5 }),
      ]);

      setRecentDocuments(docsResponse.data);
      setAnomalyStats(anomalyStatsResponse);
      setCriticalAnomalies(anomaliesResponse.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dashboard konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [dashboard, trends, byCostType, comparison] = await Promise.all([
        analyticsApi.dashboard(),
        analyticsApi.trends({ months: 12 }),
        analyticsApi.byCostType({ limit: 8 }),
        analyticsApi.comparison(),
      ]);

      setDashboardData(dashboard);
      setTrendData(trends.data);
      setCostTypeData(byCostType.data);
      setComparisonData(comparison);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analytics konnten nicht geladen werden.');
    } finally {
      setChartsLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setChartsLoading(true);
    void fetchSummary();
    void fetchAnalytics();
  }, [fetchAnalytics, fetchSummary]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    dashboardData,
    anomalyStats,
    recentDocuments,
    criticalAnomalies,
    trendData,
    costTypeData,
    comparisonData,
    isLoading,
    chartsLoading,
    error,
    reload,
  };
}
