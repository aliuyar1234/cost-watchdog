function createDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function parseDateString(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const ddMmYyyy = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ddMmYyyy) {
    return createDate(Number(ddMmYyyy[3]), Number(ddMmYyyy[2]), Number(ddMmYyyy[1]));
  }

  const ddSlashMmSlashYyyy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddSlashMmSlashYyyy) {
    return createDate(
      Number(ddSlashMmSlashYyyy[3]),
      Number(ddSlashMmSlashYyyy[2]),
      Number(ddSlashMmSlashYyyy[1]),
    );
  }

  const yyyyMmDd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDd) {
    return createDate(Number(yyyyMmDd[1]), Number(yyyyMmDd[2]), Number(yyyyMmDd[3]));
  }

  const ddMmYyyyDash = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyyyDash) {
    return createDate(Number(ddMmYyyyDash[3]), Number(ddMmYyyyDash[2]), Number(ddMmYyyyDash[1]));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    return parseDateString(value);
  }

  return null;
}

function detectDecimalSeparator(value: string): '.' | ',' {
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  return lastComma > lastDot ? ',' : '.';
}

function normalizeNumericString(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\d,.\-+]/g, '');
}

export function parseNumberString(value: string, decimalSeparator?: '.' | ','): number {
  let normalized = normalizeNumericString(value);
  if (!normalized) {
    return Number.NaN;
  }

  const separator = decimalSeparator || detectDecimalSeparator(normalized);
  if (separator === ',') {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  return Number.parseFloat(normalized);
}

export function parseNumberValue(value: unknown, decimalSeparator?: '.' | ','): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return parseNumberString(value, decimalSeparator);
  }

  return Number.NaN;
}

export function parseOptionalNumberString(
  value: string | undefined,
  decimalSeparator?: '.' | ',',
): number | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }

  const parsed = parseNumberString(value, decimalSeparator);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseOptionalNumberValue(
  value: unknown,
  decimalSeparator?: '.' | ',',
): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = parseNumberValue(value, decimalSeparator);
  return Number.isNaN(parsed) ? undefined : parsed;
}
