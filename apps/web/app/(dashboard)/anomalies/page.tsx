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
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Anomalien</h1>
        <p className="mt-1 text-gray-500">Erkannte Kostenabweichungen pruefen und bearbeiten</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-red-700">{error}</p>
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
