'use client';

import dynamic from 'next/dynamic';
import { Button } from '../../components/ui/button';
import { AnomalyAlertBanner } from './anomaly-alert-banner';
import { CriticalAnomaliesPanel } from './critical-anomalies-panel';
import { DashboardHeader } from './dashboard-header';
import { FinancialKpis } from './financial-kpis';
import { RecentDocumentsPanel } from './recent-documents-panel';
import { useDashboard } from './use-dashboard';

const DashboardCharts = dynamic(
  () => import('./dashboard-charts').then((module) => module.DashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg border bg-gray-50" />
        <div className="h-72 animate-pulse rounded-lg border bg-gray-50" />
      </div>
    ),
  },
);

export default function DashboardPage() {
  const {
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
  } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardHeader />

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="outline" size="sm" onClick={reload}>
              Erneut versuchen
            </Button>
          </div>
        </div>
      )}

      <AnomalyAlertBanner stats={anomalyStats} />

      <FinancialKpis dashboardData={dashboardData} anomalyStats={anomalyStats} />

      <DashboardCharts
        trendData={trendData}
        costTypeData={costTypeData}
        comparisonData={comparisonData}
        isLoading={chartsLoading}
      />

      <CriticalAnomaliesPanel anomalies={criticalAnomalies} />

      <RecentDocumentsPanel documents={recentDocuments} />
    </div>
  );
}
