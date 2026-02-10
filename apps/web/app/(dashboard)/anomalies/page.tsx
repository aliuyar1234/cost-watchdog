'use client';

import { Button } from '../../components/ui/button';
import { AnomalyFilters } from './anomaly-filters';
import { AnomalyList } from './anomaly-list';
import { AnomalyStatsCards } from './anomaly-stats-cards';
import { useAnomalies } from './use-anomalies';

export default function AnomaliesPage() {
  const {
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
  } = useAnomalies();

  if (isLoading && anomalies.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-heading">Anomalien</h1>
        <p className="page-subheading">Erkannte Kostenabweichungen pruefen und bearbeiten</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              Erneut versuchen
            </Button>
          </div>
        </div>
      )}

      <AnomalyStatsCards stats={stats} />

      <AnomalyFilters
        statusFilter={statusFilter}
        severityFilter={severityFilter}
        onStatusChange={updateStatusFilter}
        onSeverityChange={updateSeverityFilter}
      />

      <AnomalyList
        anomalies={anomalies}
        pagination={pagination}
        statusFilter={statusFilter}
        onAction={runAction}
        onPreviousPage={goToPreviousPage}
        onNextPage={goToNextPage}
      />
    </div>
  );
}
