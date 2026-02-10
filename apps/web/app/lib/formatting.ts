import type { ReactElement } from 'react';
import React from 'react';

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(value);
}

export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'manual';

interface StatusConfig {
  style: string;
  label: string;
}

const EXTRACTION_STATUS_CONFIG: Record<ExtractionStatus, StatusConfig> = {
  pending: { style: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', label: 'Ausstehend' },
  processing: { style: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', label: 'Verarbeitung' },
  completed: {
    style: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    label: 'Abgeschlossen',
  },
  failed: { style: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200', label: 'Fehlgeschlagen' },
  manual: { style: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200', label: 'Manuell' },
};

function renderBadge(config: StatusConfig): ReactElement {
  return React.createElement(
    'span',
    {
      className: `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${config.style}`,
    },
    config.label,
  );
}

export function getExtractionStatusBadge(status: string): ReactElement {
  const config = EXTRACTION_STATUS_CONFIG[status as ExtractionStatus] || {
    style: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    label: status,
  };
  return renderBadge(config);
}

export type AnomalyStatus = 'new' | 'acknowledged' | 'resolved' | 'false_positive';

const ANOMALY_STATUS_CONFIG: Record<AnomalyStatus, StatusConfig> = {
  new: { style: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200', label: 'Neu' },
  acknowledged: { style: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', label: 'Bestaetigt' },
  resolved: { style: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Geloest' },
  false_positive: {
    style: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    label: 'Fehlalarm',
  },
};

export function getAnomalyStatusBadge(status: string): ReactElement {
  const config = ANOMALY_STATUS_CONFIG[status as AnomalyStatus] || {
    style: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    label: status,
  };
  return renderBadge(config);
}

export type AnomalySeverity = 'info' | 'warning' | 'critical';

const SEVERITY_CONFIG: Record<AnomalySeverity, StatusConfig> = {
  info: { style: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', label: 'Info' },
  warning: { style: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', label: 'Warnung' },
  critical: { style: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200', label: 'Kritisch' },
};

export function getSeverityBadge(severity: string): ReactElement {
  const config = SEVERITY_CONFIG[severity as AnomalySeverity] || {
    style: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    label: severity,
  };
  return renderBadge(config);
}
