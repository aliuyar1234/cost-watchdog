import type { ParsedCostRow } from '../common/record-factory.js';

export interface CsvExtractionConfig {
  delimiter?: string;
  quoteChar?: string;
  hasHeader?: boolean;
  headerRow?: number;
  startRow?: number;
  encoding?: string;
  columnMappings: CsvColumnMappings;
  dateFormat?: string;
  decimalSeparator?: '.' | ',';
  skipEmptyRows?: boolean;
}

export interface CsvColumnMappings {
  periodStart: string | number;
  periodEnd?: string | number;
  amount: string | number;
  amountNet?: string | number;
  vatAmount?: string | number;
  quantity?: string | number;
  unit?: string | number;
  pricePerUnit?: string | number;
  costType?: string | number;
  supplierName?: string | number;
  invoiceNumber?: string | number;
  location?: string | number;
  contractNumber?: string | number;
  meterNumber?: string | number;
  currency?: string | number;
}

export type ParsedCsvRow = ParsedCostRow;

export type CsvColumnResolver = (mapping: string | number | undefined) => number | undefined;
