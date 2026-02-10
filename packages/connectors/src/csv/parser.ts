import {
  parseDateString,
  parseNumberString,
  parseOptionalNumberString,
} from '../common/value-parsers.js';
import type {
  CsvColumnMappings,
  CsvColumnResolver,
  CsvExtractionConfig,
  ParsedCsvRow,
} from './types.js';

export function detectDelimiter(content: string): string {
  const firstLines = content.split(/\r?\n/).slice(0, 5).join('\n');
  const delimiters = [';', ',', '\t', '|'];

  let bestDelimiter = ',';
  let maxCount = 0;
  for (const delimiter of delimiters) {
    const count = (firstLines.match(new RegExp(delimiter.replace(/[|\\]/g, '\\$&'), 'g')) || [])
      .length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

export function parseCsvContent(content: string, delimiter: string, quoteChar: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushRow = (): void => {
    row.push(cell.trim());
    if (!row.every((value) => value === '')) {
      rows.push(row);
    }
    row = [];
    cell = '';
  };

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === quoteChar) {
      if (inQuotes && nextChar === quoteChar) {
        cell += quoteChar;
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      pushRow();
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

export function createCsvColumnResolver(
  headerRow: string[] | undefined,
  hasHeader: boolean,
): CsvColumnResolver {
  const columnIndexMap = new Map<string, number>();

  if (hasHeader && headerRow) {
    headerRow.forEach((header, index) => {
      const normalized = String(header || '')
        .trim()
        .toLowerCase();
      if (normalized) {
        columnIndexMap.set(normalized, index);
      }
    });
  }

  return (mapping: string | number | undefined): number | undefined => {
    if (mapping === undefined) {
      return undefined;
    }
    if (typeof mapping === 'number') {
      return mapping;
    }
    return columnIndexMap.get(mapping.trim().toLowerCase());
  };
}

function getValue(
  row: string[],
  mapping: string | number | undefined,
  resolveColumn: CsvColumnResolver,
): string | undefined {
  const index = resolveColumn(mapping);
  return index !== undefined ? row[index] : undefined;
}

export function parseCsvRow(
  row: string[],
  mappings: CsvColumnMappings,
  resolveColumn: CsvColumnResolver,
  config: CsvExtractionConfig,
  rowIndex: number,
): ParsedCsvRow {
  const periodStartValue = getValue(row, mappings.periodStart, resolveColumn);
  if (!periodStartValue) {
    throw new Error('Missing period start date');
  }

  const periodStart = parseDateString(periodStartValue);
  if (!periodStart) {
    throw new Error(`Invalid period start date: ${periodStartValue}`);
  }

  const periodEndValue = getValue(row, mappings.periodEnd, resolveColumn);
  const periodEnd = periodEndValue ? parseDateString(periodEndValue) : periodStart;
  if (!periodEnd) {
    throw new Error(`Invalid period end date: ${periodEndValue}`);
  }

  const amountValue = getValue(row, mappings.amount, resolveColumn);
  if (!amountValue) {
    throw new Error('Missing amount');
  }

  const amount = parseNumberString(amountValue, config.decimalSeparator);
  if (Number.isNaN(amount)) {
    throw new Error(`Invalid amount: ${amountValue}`);
  }

  return {
    periodStart,
    periodEnd,
    amount,
    amountNet: parseOptionalNumberString(
      getValue(row, mappings.amountNet, resolveColumn),
      config.decimalSeparator,
    ),
    vatAmount: parseOptionalNumberString(
      getValue(row, mappings.vatAmount, resolveColumn),
      config.decimalSeparator,
    ),
    quantity: parseOptionalNumberString(
      getValue(row, mappings.quantity, resolveColumn),
      config.decimalSeparator,
    ),
    unit: getValue(row, mappings.unit, resolveColumn),
    pricePerUnit: parseOptionalNumberString(
      getValue(row, mappings.pricePerUnit, resolveColumn),
      config.decimalSeparator,
    ),
    costType: getValue(row, mappings.costType, resolveColumn),
    supplierName: getValue(row, mappings.supplierName, resolveColumn),
    invoiceNumber: getValue(row, mappings.invoiceNumber, resolveColumn),
    location: getValue(row, mappings.location, resolveColumn),
    contractNumber: getValue(row, mappings.contractNumber, resolveColumn),
    meterNumber: getValue(row, mappings.meterNumber, resolveColumn),
    currency: getValue(row, mappings.currency, resolveColumn) || 'EUR',
    rowIndex,
  };
}
