import {
  parseDateValue,
  parseNumberValue,
  parseOptionalNumberValue,
} from '../common/value-parsers.js';
import type {
  ExcelColumnMappings,
  ExcelColumnResolver,
  ExcelExtractionConfig,
  ParsedExcelRow,
} from './types.js';

export function createExcelColumnResolver(headerRow: unknown[] | undefined): ExcelColumnResolver {
  const columnIndexMap = new Map<string, number>();

  if (headerRow) {
    headerRow.forEach((header, index) => {
      const normalized = String(header || '')
        .trim()
        .toLowerCase();
      if (normalized) {
        columnIndexMap.set(normalized, index);
      }
    });
  }

  return (columnName: string | undefined): number | undefined => {
    if (!columnName) {
      return undefined;
    }
    return columnIndexMap.get(columnName.trim().toLowerCase());
  };
}

function getValue(
  row: unknown[],
  columnName: string | undefined,
  resolveColumn: ExcelColumnResolver,
): unknown {
  const index = resolveColumn(columnName);
  return index !== undefined ? row[index] : undefined;
}

export function parseExcelRow(
  row: unknown[],
  mappings: ExcelColumnMappings,
  resolveColumn: ExcelColumnResolver,
  config: ExcelExtractionConfig,
  rowIndex: number,
): ParsedExcelRow {
  const periodStartValue = getValue(row, mappings.periodStart, resolveColumn);
  const periodStart = parseDateValue(periodStartValue);
  if (!periodStart) {
    throw new Error(
      periodStartValue
        ? `Invalid period start date: ${String(periodStartValue)}`
        : 'Missing period start date',
    );
  }

  const periodEndValue = getValue(row, mappings.periodEnd, resolveColumn);
  const periodEnd = periodEndValue ? parseDateValue(periodEndValue) : periodStart;
  if (!periodEnd) {
    throw new Error(`Invalid period end date: ${String(periodEndValue)}`);
  }

  const amountValue = getValue(row, mappings.amount, resolveColumn);
  if (amountValue === null || amountValue === undefined || amountValue === '') {
    throw new Error('Missing amount');
  }

  const amount = parseNumberValue(amountValue, config.decimalSeparator);
  if (Number.isNaN(amount)) {
    throw new Error(`Invalid amount: ${String(amountValue)}`);
  }

  return {
    periodStart,
    periodEnd,
    amount,
    amountNet: parseOptionalNumberValue(
      getValue(row, mappings.amountNet, resolveColumn),
      config.decimalSeparator,
    ),
    vatAmount: parseOptionalNumberValue(
      getValue(row, mappings.vatAmount, resolveColumn),
      config.decimalSeparator,
    ),
    quantity: parseOptionalNumberValue(
      getValue(row, mappings.quantity, resolveColumn),
      config.decimalSeparator,
    ),
    unit: getValue(row, mappings.unit, resolveColumn) as string | undefined,
    pricePerUnit: parseOptionalNumberValue(
      getValue(row, mappings.pricePerUnit, resolveColumn),
      config.decimalSeparator,
    ),
    costType: getValue(row, mappings.costType, resolveColumn) as string | undefined,
    supplierName: getValue(row, mappings.supplierName, resolveColumn) as string | undefined,
    invoiceNumber: getValue(row, mappings.invoiceNumber, resolveColumn) as string | undefined,
    location: getValue(row, mappings.location, resolveColumn) as string | undefined,
    contractNumber: getValue(row, mappings.contractNumber, resolveColumn) as string | undefined,
    meterNumber: getValue(row, mappings.meterNumber, resolveColumn) as string | undefined,
    currency: (getValue(row, mappings.currency, resolveColumn) as string) || 'EUR',
    rowIndex,
  };
}
