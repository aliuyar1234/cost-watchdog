import type { ReactElement } from 'react';
import React from 'react';

/**
 * Format a date string to German locale format
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date string to German locale format (date only, no time)
 */
export function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format file size in bytes to human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Extraction status configuration
 */
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'manual';

interface StatusConfig {
  style: string;
  label: string;
}

const EXTRACTION_STATUS_CONFIG: Record<ExtractionStatus, StatusConfig> = {
  pending: { style: 'bg-yellow-100 text-yellow-800', label: 'Ausstehend' },
  processing: { style: 'bg-blue-100 text-blue-800', label: 'Verarbeitung' },
  completed: { style: 'bg-green-100 text-green-800', label: 'Abgeschlossen' },
  failed: { style: 'bg-red-100 text-red-800', label: 'Fehlgeschlagen' },
  manual: { style: 'bg-purple-100 text-purple-800', label: 'Manuell' },
};

/**
 * Get status badge element for extraction status
 */
export function getExtractionStatusBadge(status: string): ReactElement {
  const config = EXTRACTION_STATUS_CONFIG[status as ExtractionStatus] || {
    style: 'bg-gray-100 text-gray-800',
    label: status,
  };

  return React.createElement(
    'span',
    {
      className: `inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.style}`,
    },
    config.label
  );
}

/**
 * Anomaly status configuration
 */
export type AnomalyStatus = 'new' | 'acknowledged' | 'resolved' | 'false_positive';

const ANOMALY_STATUS_CONFIG: Record<AnomalyStatus, StatusConfig> = {
  new: { style: 'bg-red-100 text-red-800', label: 'Neu' },
  acknowledged: { style: 'bg-yellow-100 text-yellow-800', label: 'Bestätigt' },
  resolved: { style: 'bg-green-100 text-green-800', label: 'Gelöst' },
  false_positive: { style: 'bg-gray-100 text-gray-800', label: 'Fehlalarm' },
};

/**
 * Get status badge element for anomaly status
 */
export function getAnomalyStatusBadge(status: string): ReactElement {
  const config = ANOMALY_STATUS_CONFIG[status as AnomalyStatus] || {
    style: 'bg-gray-100 text-gray-800',
    label: status,
  };

  return React.createElement(
    'span',
    {
      className: `inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.style}`,
    },
    config.label
  );
}

/**
 * Anomaly severity configuration
 */
export type AnomalySeverity = 'info' | 'warning' | 'critical';

const SEVERITY_CONFIG: Record<AnomalySeverity, StatusConfig> = {
  info: { style: 'bg-blue-100 text-blue-800', label: 'Info' },
  warning: { style: 'bg-yellow-100 text-yellow-800', label: 'Warnung' },
  critical: { style: 'bg-red-100 text-red-800', label: 'Kritisch' },
};

/**
 * Get badge element for anomaly severity
 */
export function getSeverityBadge(severity: string): ReactElement {
  const config = SEVERITY_CONFIG[severity as AnomalySeverity] || {
    style: 'bg-gray-100 text-gray-800',
    label: severity,
  };

  return React.createElement(
    'span',
    {
      className: `inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.style}`,
    },
    config.label
  );
}
