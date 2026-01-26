'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { LinkButton } from '../../components/ui/link-button';
import { CostTrendChart } from '../../components/charts/cost-trend-chart';
import { CostBreakdownChart } from '../../components/charts/cost-breakdown-chart';
import { YearComparisonChart } from '../../components/charts/year-comparison-chart';
import {
  documentsApi,
  anomaliesApi,
  analyticsApi,
  type Document,
  type Anomaly,
  type AnomalyStats,
  type DashboardData,
  type TrendDataPoint,
  type BreakdownItem,
  type ComparisonData,
} from '../../lib/api';
import {
  formatDate,
  formatFileSize,
  formatCurrency,
  getExtractionStatusBadge,
  getSeverityBadge,
} from '../../lib/formatting';

export default function DashboardPage() {
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

  const fetchData = useCallback(async () => {
    try {
      const [docsResponse, anomalyStatsResponse, anomaliesResponse] = await Promise.all([
        documentsApi.list({ limit: 5 }),
        anomaliesApi.stats(),
        anomaliesApi.list({ status: 'new', severity: 'critical', limit: 5 }),
      ]);

      setRecentDocuments(docsResponse.data);
      setAnomalyStats(anomalyStatsResponse);
      setCriticalAnomalies(anomaliesResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dashboard konnte nicht geladen werden.');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analytics konnten nicht geladen werden.');
    } finally {
      setChartsLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setChartsLoading(true);
    void fetchData();
    void fetchAnalytics();
  }, [fetchAnalytics, fetchData]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  const yearToDateChange = dashboardData?.totals.yearToDateChange || 0;
  const monthChange = dashboardData?.totals.currentMonthChange || 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-gray-500">Übersicht Ihrer Kostenüberwachung</p>
        </div>
        <LinkButton href="/documents">Dokument hochladen</LinkButton>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-red-700">{error}</p>
            <Button variant="outline" size="sm" onClick={reload}>
              Erneut versuchen
            </Button>
          </div>
        </div>
      )}

      {/* Anomaly Alert Banner */}
      {anomalyStats && (anomalyStats.byStatus['new'] || 0) > 0 && (
        <div className="rounded-lg bg-gradient-to-r from-red-500 to-orange-500 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <div className="font-semibold">
                  {anomalyStats.byStatus['new']} offene Anomalie
                  {(anomalyStats.byStatus['new'] || 0) !== 1 ? 'n' : ''} erkannt
                </div>
                <div className="text-sm text-white/80">
                  {anomalyStats.bySeverity['critical'] || 0} kritisch,{' '}
                  {anomalyStats.bySeverity['warning'] || 0} Warnungen
                </div>
              </div>
            </div>
            <LinkButton
              href="/anomalies"
              variant="outline"
              size="sm"
              className="bg-white text-gray-900 hover:bg-gray-100"
            >
              Jetzt prüfen
            </LinkButton>
          </div>
        </div>
      )}

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-500">
              Gesamtkosten {dashboardData?.year}
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {formatCurrency(dashboardData?.totals.yearToDate || 0)}
            </div>
            <div
              className={`mt-1 text-sm ${yearToDateChange >= 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              {yearToDateChange >= 0 ? '+' : ''}
              {yearToDateChange.toFixed(1)}% vs. Vorjahr
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-500">Aktueller Monat</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {formatCurrency(dashboardData?.totals.currentMonth || 0)}
            </div>
            <div className={`mt-1 text-sm ${monthChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {monthChange >= 0 ? '+' : ''}
              {monthChange.toFixed(1)}% vs. Vormonat
            </div>
          </CardContent>
        </Card>
        <Link href="/anomalies?status=new">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="pt-6">
              <div className="text-sm font-medium text-gray-500">Offene Anomalien</div>
              <div className="mt-2 text-3xl font-bold text-red-600">
                {dashboardData?.anomalies.open || anomalyStats?.byStatus['new'] || 0}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {dashboardData?.anomalies.critical || anomalyStats?.bySeverity['critical'] || 0}{' '}
                kritisch
              </div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-500">Kostendatensätze</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {dashboardData?.totals.recordCount || 0}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              {dashboardData?.documents.total || 0} Dokumente
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kostenentwicklung (12 Monate)</CardTitle>
          </CardHeader>
          <CardContent>
            <CostTrendChart data={trendData} isLoading={chartsLoading} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kosten nach Kategorie</CardTitle>
          </CardHeader>
          <CardContent>
            <CostBreakdownChart data={costTypeData} type="costType" isLoading={chartsLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Year Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle>
            Jahresvergleich {comparisonData?.year} vs.{' '}
            {(comparisonData?.year || new Date().getFullYear()) - 1}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <YearComparisonChart data={comparisonData} isLoading={chartsLoading} />
        </CardContent>
      </Card>

      {/* Critical Anomalies */}
      {criticalAnomalies.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Kritische Anomalien
              </CardTitle>
              <Link
                href="/anomalies?severity=critical"
                className="text-sm text-blue-600 hover:underline"
              >
                Alle anzeigen
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {criticalAnomalies.map((anomaly) => (
                <Link
                  key={anomaly.id}
                  href={`/anomalies/${anomaly.id}`}
                  className="block rounded-lg border border-red-200 bg-red-50 p-3 transition-colors hover:bg-red-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        {getSeverityBadge(anomaly.severity)}
                        <span className="text-xs text-gray-500">
                          {formatDate(anomaly.detectedAt)}
                        </span>
                      </div>
                      <div className="font-medium text-gray-900">{anomaly.message}</div>
                      {anomaly.costRecord && (
                        <div className="mt-1 text-sm text-gray-600">
                          {anomaly.costRecord.supplier?.name} •{' '}
                          {formatCurrency(anomaly.costRecord.amount)}
                        </div>
                      )}
                    </div>
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Zuletzt hochgeladen</CardTitle>
            <Link href="/documents" className="text-sm text-blue-600 hover:underline">
              Alle anzeigen
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentDocuments.length === 0 ? (
            <div className="py-12 text-center">
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
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Dokumente</h3>
              <p className="mt-1 text-sm text-gray-500">Laden Sie Ihr erstes Dokument hoch.</p>
              <div className="mt-6">
                <LinkButton href="/documents">Dokument hochladen</LinkButton>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Dateiname
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Größe
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Hochgeladen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          <svg
                            className="mr-2 h-5 w-5 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="text-sm text-gray-900">{doc.originalFilename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatFileSize(doc.fileSize)}
                      </td>
                      <td className="px-4 py-4">
                        {getExtractionStatusBadge(doc.extractionStatus)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatDate(doc.uploadedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
