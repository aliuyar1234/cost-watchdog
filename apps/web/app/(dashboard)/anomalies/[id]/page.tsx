'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { LinkButton } from '../../../components/ui/link-button';
import { anomaliesApi, type Anomaly } from '../../../lib/api';
import {
  formatDate,
  formatDateShort,
  formatCurrency,
  getAnomalyStatusBadge,
  getSeverityBadge,
} from '../../../lib/formatting';

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  yoy_deviation: 'Jahresvergleich (YoY)',
  mom_deviation: 'Monatsvergleich (MoM)',
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
  district_cooling: 'Fernkälte',
  sewage: 'Abwasser',
  waste: 'Abfall',
  rent: 'Miete',
  operating_costs: 'Nebenkosten',
  insurance: 'Versicherung',
  maintenance: 'Wartung',
  it_licenses: 'IT-Lizenzen',
  it_cloud: 'Cloud-Services',
  it_hardware: 'IT-Hardware',
  telecom_internet: 'Internet',
  telecom_mobile: 'Mobilfunk',
  telecom_landline: 'Festnetz',
  fuel_diesel: 'Diesel',
  fuel_petrol: 'Benzin',
  supplier_recurring: 'Wiederkehrend',
  other: 'Sonstige',
};

export default function AnomalyDetailPage() {
  const params = useParams();
  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);

  const anomalyId = params['id'] as string;

  const fetchAnomaly = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await anomaliesApi.get(anomalyId);
      setAnomaly(data);
    } catch (error) {
      setAnomaly(null);
      setError(error instanceof Error ? error.message : 'Anomalie konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [anomalyId]);

  useEffect(() => {
    void fetchAnomaly();
  }, [fetchAnomaly]);

  const handleAction = async (action: 'acknowledge' | 'resolve' | 'false_positive') => {
    if (!anomaly) return;

    setIsProcessing(true);
    try {
      setError(null);
      switch (action) {
        case 'acknowledge':
          await anomaliesApi.acknowledge(anomaly.id, resolution || undefined);
          break;
        case 'resolve':
          await anomaliesApi.resolve(anomaly.id, resolution || undefined);
          break;
        case 'false_positive':
          await anomaliesApi.markFalsePositive(anomaly.id, resolution || undefined);
          break;
      }
      await fetchAnomaly();
      setResolution('');
      setShowResolveForm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Aktion fehlgeschlagen.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!anomaly) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900">
          {error ? 'Fehler beim Laden' : 'Anomalie nicht gefunden'}
        </h2>
        <p className="mt-2 text-gray-500">
          {error ? error : 'Die angeforderte Anomalie existiert nicht oder wurde gelöscht.'}
        </p>
        {error && (
          <div className="mt-4">
            <Button variant="outline" onClick={() => void fetchAnomaly()}>
              Erneut versuchen
            </Button>
          </div>
        )}
        <LinkButton href="/anomalies" className="mt-4">
          Zurück zur Übersicht
        </LinkButton>
      </div>
    );
  }

  const details = anomaly.details || {};

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-red-700">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchAnomaly()}>
              Erneut versuchen
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Link
              href="/anomalies"
              className="text-gray-500 transition-colors hover:text-gray-700"
              aria-label="Zurück zur Übersicht"
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
              {ANOMALY_TYPE_LABELS[anomaly.type] || anomaly.type}
            </span>
            {anomaly.isBackfill && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                Historisch
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {anomaly.status === 'new' && (
            <>
              <Button
                variant="outline"
                onClick={() => handleAction('acknowledge')}
                disabled={isProcessing}
              >
                Bestätigen
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleAction('false_positive')}
                disabled={isProcessing}
                className="text-gray-500"
              >
                Fehlalarm
              </Button>
            </>
          )}
          {anomaly.status === 'acknowledged' && (
            <Button onClick={() => setShowResolveForm(true)} disabled={isProcessing}>
              Als gelöst markieren
            </Button>
          )}
        </div>
      </div>

      {/* Resolve Form */}
      {showResolveForm && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-medium text-gray-900">Anomalie lösen</h3>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Beschreiben Sie, wie die Anomalie gelöst wurde..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              rows={3}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowResolveForm(false);
                  setResolution('');
                }}
              >
                Abbrechen
              </Button>
              <Button onClick={() => handleAction('resolve')} disabled={isProcessing}>
                Lösen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Cost Record Details */}
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
                      {COST_TYPE_LABELS[anomaly.costRecord.costType] || anomaly.costRecord.costType}
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

          {/* Anomaly Details */}
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
                    <dt className="text-gray-500">Tatsächlicher Wert</dt>
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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Location & Supplier */}
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

          {/* Timeline */}
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
                      <div className="text-sm font-medium">Bestätigt</div>
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
                      <div className="text-sm font-medium">Gelöst</div>
                      {anomaly.resolution && (
                        <div className="mt-1 text-xs text-gray-600">
                          {String(anomaly.resolution)}
                        </div>
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
                        <div className="mt-1 text-xs text-gray-600">
                          {String(anomaly.resolution)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
