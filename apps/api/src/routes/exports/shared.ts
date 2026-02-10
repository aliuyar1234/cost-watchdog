export const MAX_EXPORT_LIMIT = 1000;
const CSV_FORMULA_PREFIX = /^[=+\-@]/;

export interface ExportQuery {
  year?: number;
  month?: number;
  costType?: string;
  locationId?: string;
  supplierId?: string;
  format?: 'csv' | 'json';
  limit?: number;
  offset?: number;
}

export interface AnomalyExportQuery {
  status?: string;
  severity?: string;
  format?: string;
  limit?: number;
  offset?: number;
}

export interface MonthlyReportQuery {
  year: string;
  month: string;
}

export function sanitizeCsvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  const trimmedStart = escaped.trimStart();

  if (trimmedStart.length > 0 && CSV_FORMULA_PREFIX.test(trimmedStart)) {
    return `'${escaped}`;
  }

  return escaped;
}

export function toCsvRow(values: readonly unknown[]): string {
  return values.map((value) => `"${sanitizeCsvCell(value)}"`).join(';');
}

export function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

export function formatCsvNumber(value: number, fractionDigits: number = 2): string {
  return value.toFixed(fractionDigits).replace('.', ',');
}
