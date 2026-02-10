'use client';

import { useParams } from 'next/navigation';
import { Button } from '../../../components/ui/button';
import { LinkButton } from '../../../components/ui/link-button';
import { AnomalyDetailHeader } from './anomaly-detail-header';
import { AnomalyDetailSections } from './anomaly-detail-sections';
import { ResolveForm } from './resolve-form';
import { useAnomalyDetail } from './use-anomaly-detail';

export default function AnomalyDetailPage() {
  const params = useParams();
  const anomalyId = params['id'] as string;
  const {
    anomaly,
    isLoading,
    isProcessing,
    error,
    resolution,
    showResolveForm,
    fetchAnomaly,
    runAction,
    setResolution,
    setShowResolveForm,
  } = useAnomalyDetail(anomalyId);

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
          {error ? error : 'Die angeforderte Anomalie existiert nicht oder wurde geloescht.'}
        </p>
        {error && (
          <div className="mt-4">
            <Button variant="outline" onClick={() => void fetchAnomaly()}>
              Erneut versuchen
            </Button>
          </div>
        )}
        <LinkButton href="/anomalies" className="mt-4">
          Zurueck zur Uebersicht
        </LinkButton>
      </div>
    );
  }

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

      <AnomalyDetailHeader
        anomaly={anomaly}
        isProcessing={isProcessing}
        onAcknowledge={() => void runAction('acknowledge')}
        onFalsePositive={() => void runAction('false_positive')}
        onStartResolve={() => setShowResolveForm(true)}
      />

      {showResolveForm && (
        <ResolveForm
          value={resolution}
          isProcessing={isProcessing}
          onChange={setResolution}
          onCancel={() => {
            setShowResolveForm(false);
            setResolution('');
          }}
          onConfirm={() => void runAction('resolve')}
        />
      )}

      <AnomalyDetailSections anomaly={anomaly} />
    </div>
  );
}
