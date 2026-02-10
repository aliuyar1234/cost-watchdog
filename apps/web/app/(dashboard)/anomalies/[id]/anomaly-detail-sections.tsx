import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import type { Anomaly } from '../../../lib/api';
import { formatCurrency, formatDate, formatDateShort } from '../../../lib/formatting';
import { getCostTypeLabel } from '../../../lib/labels';

interface AnomalyDetailSectionsProps {
  anomaly: Anomaly;
}

export function AnomalyDetailSections({ anomaly }: AnomalyDetailSectionsProps) {
  const details = anomaly.details || {};

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {anomaly.costRecord && (
          <Card>
            <CardHeader>
              <CardTitle>Kostendetails</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-500">Betrag</dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {formatCurrency(anomaly.costRecord.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Kostenart</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {getCostTypeLabel(anomaly.costRecord.costType)}
                  </dd>
                </div>
                {anomaly.costRecord.quantity !== null && (
                  <div>
                    <dt className="text-sm text-gray-500">Menge</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {anomaly.costRecord.quantity} {anomaly.costRecord.unit}
                    </dd>
                  </div>
                )}
                {anomaly.costRecord.pricePerUnit !== null && (
                  <div>
                    <dt className="text-sm text-gray-500">Preis/Einheit</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {formatCurrency(anomaly.costRecord.pricePerUnit)}/{anomaly.costRecord.unit}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-500">Zeitraum</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {formatDateShort(anomaly.costRecord.periodStart)} -{' '}
                    {formatDateShort(anomaly.costRecord.periodEnd)}
                  </dd>
                </div>
                {anomaly.costRecord.invoiceNumber && (
                  <div>
                    <dt className="text-sm text-gray-500">Rechnungsnummer</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {anomaly.costRecord.invoiceNumber}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Analyseergebnis</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {details['expectedValue'] !== undefined && (
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-gray-500">Erwarteter Wert</dt>
                  <dd className="font-medium">
                    {formatCurrency(details['expectedValue'] as number)}
                  </dd>
                </div>
              )}
              {details['actualValue'] !== undefined && (
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-gray-500">Tatsaechlicher Wert</dt>
                  <dd className="font-medium">
                    {formatCurrency(details['actualValue'] as number)}
                  </dd>
                </div>
              )}
              {details['deviationPercent'] !== undefined && (
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-gray-500">Abweichung</dt>
                  <dd
                    className={`font-medium ${
                      (details['deviationPercent'] as number) > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {(details['deviationPercent'] as number) > 0 ? '+' : ''}
                    {(details['deviationPercent'] as number).toFixed(1)}%
                  </dd>
                </div>
              )}
              {details['zScore'] !== undefined && (
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-gray-500">Z-Score</dt>
                  <dd className="font-medium">{(details['zScore'] as number).toFixed(2)}</dd>
                </div>
              )}
              {typeof details['method'] === 'string' && (
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-gray-500">Methode</dt>
                  <dd className="font-medium">{details['method']}</dd>
                </div>
              )}
              {typeof details['comparisonPeriod'] === 'string' && (
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-gray-500">Vergleichszeitraum</dt>
                  <dd className="font-medium">{details['comparisonPeriod']}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {anomaly.costRecord && (
          <Card>
            <CardHeader>
              <CardTitle>Zuordnung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {anomaly.costRecord.supplier && (
                <div>
                  <div className="text-sm text-gray-500">Lieferant</div>
                  <div className="font-medium">{anomaly.costRecord.supplier.name}</div>
                  <div className="text-sm text-gray-400">
                    {anomaly.costRecord.supplier.category}
                  </div>
                </div>
              )}
              {anomaly.costRecord.location && (
                <div>
                  <div className="text-sm text-gray-500">Standort</div>
                  <div className="font-medium">{anomaly.costRecord.location.name}</div>
                  <div className="text-sm text-gray-400">{anomaly.costRecord.location.type}</div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Verlauf</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-2 h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <div className="text-sm font-medium">Erkannt</div>
                  <div className="text-xs text-gray-500">{formatDate(anomaly.detectedAt)}</div>
                </div>
              </div>
              {anomaly.acknowledgedAt && (
                <div className="flex items-start gap-3">
                  <div className="mt-2 h-2 w-2 rounded-full bg-yellow-500" />
                  <div>
                    <div className="text-sm font-medium">Bestaetigt</div>
                    <div className="text-xs text-gray-500">
                      {formatDate(anomaly.acknowledgedAt)}
                    </div>
                  </div>
                </div>
              )}
              {anomaly.status === 'resolved' && (
                <div className="flex items-start gap-3">
                  <div className="mt-2 h-2 w-2 rounded-full bg-green-500" />
                  <div>
                    <div className="text-sm font-medium">Geloest</div>
                    {anomaly.resolution && (
                      <div className="mt-1 text-xs text-gray-600">{String(anomaly.resolution)}</div>
                    )}
                  </div>
                </div>
              )}
              {anomaly.status === 'false_positive' && (
                <div className="flex items-start gap-3">
                  <div className="mt-2 h-2 w-2 rounded-full bg-gray-400" />
                  <div>
                    <div className="text-sm font-medium">Als Fehlalarm markiert</div>
                    {anomaly.resolution && (
                      <div className="mt-1 text-xs text-gray-600">{String(anomaly.resolution)}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
