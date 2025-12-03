'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { anomaliesApi, type Anomaly, type AnomalyStats } from '../../lib/api';
import {
  formatDate,
  formatCurrency,
  getAnomalyStatusBadge,
  getSeverityBadge,
} from '../../lib/formatting';

type StatusFilter = 'all' | 'new' | 'acknowledged' | 'resolved' | 'false_positive';
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  yoy_deviation: 'Jahresvergleich',
  mom_deviation: 'Monatsvergleich',
  price_per_unit_spike: 'Preis pro Einheit',
  statistical_outlier: 'Statistischer Ausreißer',
  duplicate_detection: 'Mögliches Duplikat',
  missing_period: 'Fehlende Periode',
  seasonal_anomaly: 'Saisonale Anomalie',
  budget_exceeded: 'Budget überschritten',
};

const COST_TYPE_LABELS: Record<string, string> = {
  electricity: 'Strom',
  natural_gas: 'Erdgas',
  water: 'Wasser',
  heating_oil: 'Heizöl',
  district_heating: 'Fernwärme',
  rent: 'Miete',
  insurance: 'Versicherung',
  maintenance: 'Wartung',
  it_licenses: 'IT-Lizenzen',
  it_cloud: 'Cloud-Services',
  telecom_internet: 'Internet',
  telecom_mobile: 'Mobilfunk',
  other: 'Sonstige',
};

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  const fetchData = async () => {
    try {
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
    } catch (error) {
      console.error('Failed to fetch anomalies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [statusFilter, severityFilter, pagination.offset]);

  const handleAction = async (
    id: string,
    action: 'acknowledge' | 'resolve' | 'false_positive'
  ) => {
    try {
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
    } catch (error) {
      console.error(`Failed to ${action} anomaly:`, error);
    }
  };

  if (isLoading && anomalies.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const newCount = stats?.byStatus['new'] || 0;
  const criticalCount = stats?.bySeverity['critical'] || 0;
  const warningCount = stats?.bySeverity['warning'] || 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Anomalien</h1>
        <p className="text-gray-500 mt-1">
          Erkannte Kostenabweichungen prüfen und bearbeiten
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-500">Offene Anomalien</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{newCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-500">Kritisch</div>
            <div className="text-3xl font-bold text-red-600 mt-2">{criticalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-500">Warnungen</div>
            <div className="text-3xl font-bold text-yellow-600 mt-2">{warningCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-500">Letzte 24h</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {stats?.newLast24h || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setPagination((p) => ({ ...p, offset: 0 }));
                }}
                className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="all">Alle</option>
                <option value="new">Neu</option>
                <option value="acknowledged">Bestätigt</option>
                <option value="resolved">Gelöst</option>
                <option value="false_positive">Fehlalarm</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priorität
              </label>
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value as SeverityFilter);
                  setPagination((p) => ({ ...p, offset: 0 }));
                }}
                className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="all">Alle</option>
                <option value="critical">Kritisch</option>
                <option value="warning">Warnung</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anomaly List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {pagination.total} Anomalie{pagination.total !== 1 ? 'n' : ''} gefunden
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                Keine Anomalien gefunden
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {statusFilter === 'new'
                  ? 'Alle Anomalien wurden bearbeitet.'
                  : 'Keine Anomalien entsprechen Ihren Filterkriterien.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {anomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getSeverityBadge(anomaly.severity)}
                        {getAnomalyStatusBadge(anomaly.status)}
                        <span className="text-xs text-gray-500">
                          {ANOMALY_TYPE_LABELS[anomaly.type] || anomaly.type}
                        </span>
                      </div>
                      <h3 className="font-medium text-gray-900">{anomaly.message}</h3>
                      {anomaly.costRecord && (
                        <div className="mt-2 text-sm text-gray-600">
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                              <strong>Betrag:</strong>{' '}
                              {formatCurrency(anomaly.costRecord.amount)}
                            </span>
                            <span>
                              <strong>Kostenart:</strong>{' '}
                              {COST_TYPE_LABELS[anomaly.costRecord.costType] ||
                                anomaly.costRecord.costType}
                            </span>
                            {anomaly.costRecord.supplier && (
                              <span>
                                <strong>Lieferant:</strong>{' '}
                                {anomaly.costRecord.supplier.name}
                              </span>
                            )}
                            {anomaly.costRecord.location && (
                              <span>
                                <strong>Standort:</strong>{' '}
                                {anomaly.costRecord.location.name}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-500">
                        Erkannt: {formatDate(anomaly.detectedAt)}
                        {anomaly.isBackfill && (
                          <span className="ml-2 text-amber-600">(Historisch)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Link href={`/anomalies/${anomaly.id}`}>
                        <Button variant="outline" size="sm">
                          Details
                        </Button>
                      </Link>
                      {anomaly.status === 'new' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction(anomaly.id, 'acknowledge')}
                          >
                            Bestätigen
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction(anomaly.id, 'false_positive')}
                            className="text-gray-500"
                          >
                            Fehlalarm
                          </Button>
                        </>
                      )}
                      {anomaly.status === 'acknowledged' && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleAction(anomaly.id, 'resolve')}
                        >
                          Lösen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {pagination.total > pagination.limit && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    Zeige {pagination.offset + 1} bis{' '}
                    {Math.min(pagination.offset + anomalies.length, pagination.total)} von{' '}
                    {pagination.total}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.offset === 0}
                      onClick={() =>
                        setPagination((p) => ({
                          ...p,
                          offset: Math.max(0, p.offset - p.limit),
                        }))
                      }
                    >
                      Zurück
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!pagination.hasMore}
                      onClick={() =>
                        setPagination((p) => ({ ...p, offset: p.offset + p.limit }))
                      }
                    >
                      Weiter
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
