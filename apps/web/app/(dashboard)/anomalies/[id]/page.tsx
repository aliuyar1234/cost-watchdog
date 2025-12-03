'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
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
  const router = useRouter();
  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resolution, setResolution] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);

  const anomalyId = params['id'] as string;

  const fetchAnomaly = async () => {
    try {
      const data = await anomaliesApi.get(anomalyId);
      setAnomaly(data);
    } catch (error) {
      console.error('Failed to fetch anomaly:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomaly();
  }, [anomalyId]);

  const handleAction = async (action: 'acknowledge' | 'resolve' | 'false_positive') => {
    if (!anomaly) return;

    setIsProcessing(true);
    try {
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
      console.error(`Failed to ${action} anomaly:`, error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!anomaly) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Anomalie nicht gefunden</h2>
        <p className="mt-2 text-gray-500">
          Die angeforderte Anomalie existiert nicht oder wurde gelöscht.
        </p>
        <Link href="/anomalies">
          <Button className="mt-4">Zurück zur Übersicht</Button>
        </Link>
      </div>
    );
  }

  const details = anomaly.details || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/anomalies"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <div className="flex items-center gap-2 mt-2">
            {getSeverityBadge(anomaly.severity)}
            {getAnomalyStatusBadge(anomaly.status)}
            <span className="text-sm text-gray-500">
              {ANOMALY_TYPE_LABELS[anomaly.type] || anomaly.type}
            </span>
            {anomaly.isBackfill && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
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
            <Button
              onClick={() => setShowResolveForm(true)}
              disabled={isProcessing}
            >
              Als gelöst markieren
            </Button>
          )}
        </div>
      </div>

      {/* Resolve Form */}
      {showResolveForm && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-medium text-gray-900 mb-3">Anomalie lösen</h3>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Beschreiben Sie, wie die Anomalie gelöst wurde..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              rows={3}
            />
            <div className="flex justify-end gap-2 mt-3">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
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
                      {COST_TYPE_LABELS[anomaly.costRecord.costType] ||
                        anomaly.costRecord.costType}
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
                        {formatCurrency(anomaly.costRecord.pricePerUnit)}/
                        {anomaly.costRecord.unit}
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
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-gray-500">Erwarteter Wert</dt>
                    <dd className="font-medium">
                      {formatCurrency(details['expectedValue'] as number)}
                    </dd>
                  </div>
                )}
                {details['actualValue'] !== undefined && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-gray-500">Tatsächlicher Wert</dt>
                    <dd className="font-medium">
                      {formatCurrency(details['actualValue'] as number)}
                    </dd>
                  </div>
                )}
                {details['deviationPercent'] !== undefined && (
                  <div className="flex justify-between items-center py-2 border-b">
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
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-gray-500">Z-Score</dt>
                    <dd className="font-medium">
                      {(details['zScore'] as number).toFixed(2)}
                    </dd>
                  </div>
                )}
                {typeof details['method'] === 'string' && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-gray-500">Methode</dt>
                    <dd className="font-medium">{details['method']}</dd>
                  </div>
                )}
                {typeof details['comparisonPeriod'] === 'string' && (
                  <div className="flex justify-between items-center py-2 border-b">
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
                    <div className="text-sm text-gray-400">
                      {anomaly.costRecord.location.type}
                    </div>
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
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                  <div>
                    <div className="text-sm font-medium">Erkannt</div>
                    <div className="text-xs text-gray-500">
                      {formatDate(anomaly.detectedAt)}
                    </div>
                  </div>
                </div>
                {anomaly.acknowledgedAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2" />
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
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2" />
                    <div>
                      <div className="text-sm font-medium">Gelöst</div>
                      {anomaly.resolution && (
                        <div className="text-xs text-gray-600 mt-1">
                          {String(anomaly.resolution)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {anomaly.status === 'false_positive' && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-gray-400 rounded-full mt-2" />
                    <div>
                      <div className="text-sm font-medium">Als Fehlalarm markiert</div>
                      {anomaly.resolution && (
                        <div className="text-xs text-gray-600 mt-1">
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
