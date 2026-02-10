import { secrets } from './secrets.js';

export const PRIMARY_INGEST_MIME_TYPES = ['text/csv'] as const;
export const PDF_INGEST_MIME_TYPE = 'application/pdf';

export const LEGACY_SPREADSHEET_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const;

export const LEGACY_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;

export const SUPPORTED_UPLOAD_MIME_TYPES = [
  ...PRIMARY_INGEST_MIME_TYPES,
  PDF_INGEST_MIME_TYPE,
] as const;

export const CSV_PRIMARY_INGEST_REASON =
  'CSV is the primary ingest format. Convert XLS/XLSX to CSV and re-upload.';

export const PDF_LLM_KEY_MISSING_UPLOAD_REASON =
  'PDF upload requires ANTHROPIC_API_KEY for LLM extraction. Upload CSV or configure the key.';

export const PDF_LLM_KEY_MISSING_EXTRACTION_REASON =
  'Automatic PDF extraction requires ANTHROPIC_API_KEY. Upload CSV or configure the key.';

export function isCsvPrimaryMimeType(mimeType: string): boolean {
  return PRIMARY_INGEST_MIME_TYPES.some((value) => value === mimeType);
}

export function isPdfMimeType(mimeType: string): boolean {
  return mimeType === PDF_INGEST_MIME_TYPE;
}

export function isLegacySpreadsheetMimeType(mimeType: string): boolean {
  return LEGACY_SPREADSHEET_MIME_TYPES.some((value) => value === mimeType);
}

export function isLegacyImageMimeType(mimeType: string): boolean {
  return LEGACY_IMAGE_MIME_TYPES.some((value) => value === mimeType);
}

export function canProcessPdfWithLlm(): boolean {
  return Boolean(secrets.getAnthropicApiKey());
}
