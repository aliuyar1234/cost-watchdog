import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { LinkButton } from '../../components/ui/link-button';
import type { Anomaly } from '../../lib/api';
import {
  formatCurrency,
  formatDate,
  getAnomalyStatusBadge,
  getSeverityBadge,
} from '../../lib/formatting';
import { getAnomalyTypeLabel, getCostTypeLabel } from '../../lib/labels';
import type { AnomalyPagination, StatusFilter } from './types';

interface AnomalyListProps {
  anomalies: Anomaly[];
  pagination: AnomalyPagination;
  statusFilter: StatusFilter;
  onAction: (id: string, action: 'acknowledge' | 'resolve' | 'false_positive') => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function AnomalyList({
  anomalies,
  pagination,
  statusFilter,
  onAction,
  onPreviousPage,
  onNextPage,
}: AnomalyListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {pagination.total} Anomalie{pagination.total !== 1 ? 'n' : ''} gefunden
        </CardTitle>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Anomalien gefunden</h3>
            <p className="mt-1 text-sm text-gray-500">
              {statusFilter === 'new'
                ? 'Alle Anomalien wurden bearbeitet.'
                : 'Keine Anomalien entsprechen den aktuellen Filtern.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {anomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className="rounded-lg border p-4 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      {getSeverityBadge(anomaly.severity)}
                      {getAnomalyStatusBadge(anomaly.status)}
                      <span className="text-xs text-gray-500">
                        {getAnomalyTypeLabel(anomaly.type)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900">{anomaly.message}</h3>
                    {anomaly.costRecord && (
                      <div className="mt-2 text-sm text-gray-600">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            <strong>Betrag:</strong> {formatCurrency(anomaly.costRecord.amount)}
                          </span>
                          <span>
                            <strong>Kostenart:</strong>{' '}
                            {getCostTypeLabel(anomaly.costRecord.costType)}
                          </span>
                          {anomaly.costRecord.supplier && (
                            <span>
                              <strong>Lieferant:</strong> {anomaly.costRecord.supplier.name}
                            </span>
                          )}
                          {anomaly.costRecord.location && (
                            <span>
                              <strong>Standort:</strong> {anomaly.costRecord.location.name}
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
                  <div className="ml-4 flex items-center gap-2">
                    <LinkButton href={`/anomalies/${anomaly.id}`} variant="outline" size="sm">
                      Details
                    </LinkButton>
                    {anomaly.status === 'new' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onAction(anomaly.id, 'acknowledge')}
                        >
                          Bestaetigen
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAction(anomaly.id, 'false_positive')}
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
                        onClick={() => onAction(anomaly.id, 'resolve')}
                      >
                        Loesen
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {pagination.total > pagination.limit && (
              <div className="flex items-center justify-between border-t pt-4">
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
                    onClick={onPreviousPage}
                  >
                    Zurueck
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasMore}
                    onClick={onNextPage}
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
  );
}
