import type { ParsedCostRow } from '../common/record-factory.js';

export interface ExcelExtractionConfig {
  sheetName?: string;
  sheetIndex?: number;
  headerRow?: number;
  startRow?: number;
  columnMappings: ExcelColumnMappings;
  dateFormat?: string;
  decimalSeparator?: '.' | ',';
  skipEmptyRows?: boolean;
}

export interface ExcelColumnMappings {
  periodStart: string;
  periodEnd?: string;
  amount: string;
  amountNet?: string;
  vatAmount?: string;
  quantity?: string;
  unit?: string;
  pricePerUnit?: string;
  costType?: string;
  supplierName?: string;
  invoiceNumber?: string;
  location?: string;
  contractNumber?: string;
  meterNumber?: string;
  currency?: string;
}

export type ParsedExcelRow = ParsedCostRow;

export type ExcelColumnResolver = (columnName: string | undefined) => number | undefined;
