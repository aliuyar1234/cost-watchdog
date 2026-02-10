'use client';

import { useCallback, useEffect, useState } from 'react';
import { anomaliesApi, type Anomaly } from '../../../lib/api';

type DetailAction = 'acknowledge' | 'resolve' | 'false_positive';

export function useAnomalyDetail(anomalyId: string) {
  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);

  const fetchAnomaly = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await anomaliesApi.get(anomalyId);
      setAnomaly(data);
    } catch (cause) {
      setAnomaly(null);
      setError(cause instanceof Error ? cause.message : 'Anomalie konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  }, [anomalyId]);

  useEffect(() => {
    void fetchAnomaly();
  }, [fetchAnomaly]);

  const runAction = useCallback(
    async (action: DetailAction) => {
      if (!anomaly) {
        return;
      }

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
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen.');
      } finally {
        setIsProcessing(false);
      }
    },
    [anomaly, fetchAnomaly, resolution],
  );

  return {
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
  };
}
