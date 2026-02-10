import Link from 'next/link';
import { Button } from '../../../components/ui/button';
import type { Anomaly } from '../../../lib/api';
import { getAnomalyStatusBadge, getSeverityBadge } from '../../../lib/formatting';
import { getAnomalyTypeLabel } from '../../../lib/labels';

interface AnomalyDetailHeaderProps {
  anomaly: Anomaly;
  isProcessing: boolean;
  onAcknowledge: () => void;
  onFalsePositive: () => void;
  onStartResolve: () => void;
}

export function AnomalyDetailHeader({
  anomaly,
  isProcessing,
  onAcknowledge,
  onFalsePositive,
  onStartResolve,
}: AnomalyDetailHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Link
            href="/anomalies"
            className="text-gray-500 transition-colors hover:text-gray-700"
            aria-label="Zurueck zur Uebersicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <span className="text-gray-500">Anomalie-Details</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{anomaly.message}</h1>
        <div className="mt-2 flex items-center gap-2">
          {getSeverityBadge(anomaly.severity)}
          {getAnomalyStatusBadge(anomaly.status)}
          <span className="text-sm text-gray-500">
            {getAnomalyTypeLabel(anomaly.type, 'default')}
          </span>
          {anomaly.isBackfill && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
              Historisch
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {anomaly.status === 'new' && (
          <>
            <Button variant="outline" onClick={onAcknowledge} disabled={isProcessing}>
              Bestaetigen
            </Button>
            <Button
              variant="ghost"
              onClick={onFalsePositive}
              disabled={isProcessing}
              className="text-gray-500"
            >
              Fehlalarm
            </Button>
          </>
        )}
        {anomaly.status === 'acknowledged' && (
          <Button onClick={onStartResolve} disabled={isProcessing}>
            Als geloest markieren
          </Button>
        )}
      </div>
    </div>
  );
}
