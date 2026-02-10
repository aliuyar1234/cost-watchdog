import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import type { Anomaly } from '../../lib/api';
import { formatCurrency, formatDate, getSeverityBadge } from '../../lib/formatting';

interface CriticalAnomaliesPanelProps {
  anomalies: Anomaly[];
}

export function CriticalAnomaliesPanel({ anomalies }: CriticalAnomaliesPanelProps) {
  if (anomalies.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            Kritische Anomalien
          </CardTitle>
          <Link
            href="/anomalies?severity=critical"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900 hover:underline"
          >
            Alle anzeigen
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {anomalies.map((anomaly) => (
            <Link
              key={anomaly.id}
              href={`/anomalies/${anomaly.id}`}
              className="block rounded-xl border border-rose-200 bg-rose-50/80 p-3 transition hover:bg-rose-100/80"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    {getSeverityBadge(anomaly.severity)}
                    <span className="text-xs text-gray-500">{formatDate(anomaly.detectedAt)}</span>
                  </div>
                  <div className="font-medium text-gray-900">{anomaly.message}</div>
                  {anomaly.costRecord && (
                    <div className="mt-1 text-sm text-gray-600">
                      {anomaly.costRecord.supplier?.name} -{' '}
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
  );
}
