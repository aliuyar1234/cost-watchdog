import Link from 'next/link';
import { Card, CardContent } from '../../components/ui/card';
import type { AnomalyStats, DashboardData } from '../../lib/api';
import { formatCurrency } from '../../lib/formatting';

interface FinancialKpisProps {
  dashboardData: DashboardData | null;
  anomalyStats: AnomalyStats | null;
}

export function FinancialKpis({ dashboardData, anomalyStats }: FinancialKpisProps) {
  const yearToDateChange = dashboardData?.totals.yearToDateChange || 0;
  const monthChange = dashboardData?.totals.currentMonthChange || 0;

  return (
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
          <div className="text-sm font-medium text-gray-500">Kostendatensaetze</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {dashboardData?.totals.recordCount || 0}
          </div>
          <div className="mt-1 text-sm text-gray-500">
            {dashboardData?.documents.total || 0} Dokumente
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
