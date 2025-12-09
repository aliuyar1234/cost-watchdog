import type {
  Connector,
  ConnectorInput,
  ExtractionResult,
  ExtractedCostRecord,
  ValidationResult,
  ConnectionTestResult,
  JSONSchema,
} from '@cost-watchdog/connector-sdk';
import type { CostType, ConsumptionUnit } from '@cost-watchdog/core';
import { createHash } from 'crypto';

/**
 * Excel extraction configuration
 */
export interface ExcelExtractionConfig {
  /** Sheet name or index to process (default: first sheet) */
  sheetName?: string;
  sheetIndex?: number;
  /** Row containing headers (1-based, default: 1) */
  headerRow?: number;
  /** First data row (1-based, default: 2) */
  startRow?: number;
  /** Column mappings */
  columnMappings: ExcelColumnMappings;
  /** Date format in the file (default: auto-detect) */
  dateFormat?: string;
  /** Decimal separator (default: auto-detect) */
  decimalSeparator?: '.' | ',';
  /** Skip empty rows */
  skipEmptyRows?: boolean;
}

/**
 * Column mappings for Excel extraction
 */
export interface ExcelColumnMappings {
  /** Column for period start date (required) */
  periodStart: string;
  /** Column for period end date (optional, defaults to periodStart) */
  periodEnd?: string;
  /** Column for amount (required) */
  amount: string;
  /** Column for net amount */
  amountNet?: string;
  /** Column for VAT amount */
  vatAmount?: string;
  /** Column for quantity/consumption */
  quantity?: string;
  /** Column for unit */
  unit?: string;
  /** Column for price per unit */
  pricePerUnit?: string;
  /** Column for cost type */
  costType?: string;
  /** Column for supplier name */
  supplierName?: string;
  /** Column for invoice number */
  invoiceNumber?: string;
  /** Column for location/site identifier */
  location?: string;
  /** Column for contract number */
  contractNumber?: string;
  /** Column for meter number */
  meterNumber?: string;
  /** Column for currency */
  currency?: string;
}

/**
 * Result of parsing an Excel row
 */
interface ParsedRow {
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  amountNet?: number;
  vatAmount?: number;
  quantity?: number;
  unit?: string;
  pricePerUnit?: number;
  costType?: string;
  supplierName?: string;
  invoiceNumber?: string;
  location?: string;
  contractNumber?: string;
  meterNumber?: string;
  currency: string;
  rowIndex: number;
}

/**
 * Excel connector for extracting cost data from Excel files (.xlsx, .xls)
 *
 * IMPORTANT: This connector only extracts data - no side effects!
 * The Ingestion Service handles validation, deduplication, storage, and events.
 */
export const excelConnector: Connector = {
  id: 'excel',
  name: 'Excel Connector',
  type: 'file',
  supportedCostTypes: [
    'electricity',
    'natural_gas',
    'heating_oil',
    'district_heating',
    'district_cooling',
    'water',
    'sewage',
    'waste',
    'maintenance',
    'rent',
    'operating_costs',
    'insurance',
    'telecom_landline',
    'telecom_mobile',
    'telecom_internet',
    'it_licenses',
    'it_cloud',
    'it_hardware',
    'other',
  ],
  version: '1.0.0',

  configSchema: {
    type: 'object',
    properties: {
      sheetName: { type: 'string' },
      sheetIndex: { type: 'number' },
      headerRow: { type: 'number' },
      startRow: { type: 'number' },
      dateFormat: { type: 'string' },
      decimalSeparator: { type: 'string', enum: ['.', ','] },
      skipEmptyRows: { type: 'boolean' },
      columnMappings: {
        type: 'object',
        properties: {
          periodStart: { type: 'string' },
          periodEnd: { type: 'string' },
          amount: { type: 'string' },
          amountNet: { type: 'string' },
          vatAmount: { type: 'string' },
          quantity: { type: 'string' },
          unit: { type: 'string' },
          pricePerUnit: { type: 'string' },
          costType: { type: 'string' },
          supplierName: { type: 'string' },
          invoiceNumber: { type: 'string' },
          location: { type: 'string' },
          contractNumber: { type: 'string' },
          meterNumber: { type: 'string' },
          currency: { type: 'string' },
        },
        required: ['periodStart', 'amount'],
      },
    },
    required: ['columnMappings'],
  } as unknown as JSONSchema,

  async extract(input: ConnectorInput): Promise<ExtractionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      if (!input.buffer) {
        return {
          success: false,
          records: [],
          metadata: {
            sourceType: 'excel',
            extractionTimestamp: new Date(),
            confidence: 0,
            warnings: ['No file buffer provided'],
          },
          audit: {
            connectorId: this.id,
            connectorVersion: this.version,
            inputHash: '',
          },
          error: 'No file buffer provided',
        };
      }

      const inputHash = createHash('sha256').update(input.buffer).digest('hex');
      const config = (input.config || {}) as unknown as ExcelExtractionConfig;

      // Validate required config
      if (!config.columnMappings?.periodStart || !config.columnMappings?.amount) {
        return {
          success: false,
          records: [],
          metadata: {
            sourceType: 'excel',
            extractionTimestamp: new Date(),
            confidence: 0,
            warnings: ['Missing required column mappings: periodStart and amount'],
          },
          audit: {
            connectorId: this.id,
            connectorVersion: this.version,
            inputHash,
          },
          error: 'Missing required column mappings',
        };
      }

      // Parse Excel file using exceljs library (safer alternative to xlsx)
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      // Load directly from buffer - exceljs accepts Buffer
      await workbook.xlsx.load(input.buffer as unknown as ArrayBuffer);

      // Select sheet
      let worksheet: import('exceljs').Worksheet | undefined;
      if (config.sheetName) {
        worksheet = workbook.getWorksheet(config.sheetName);
      } else if (config.sheetIndex !== undefined) {
        worksheet = workbook.worksheets[config.sheetIndex];
      } else {
        worksheet = workbook.worksheets[0];
      }

      const sheetName = worksheet?.name || 'unknown';

      if (!worksheet) {
        return {
          success: false,
          records: [],
          metadata: {
            sourceType: 'excel',
            extractionTimestamp: new Date(),
            confidence: 0,
            warnings: [`Sheet not found: ${config.sheetName || config.sheetIndex || 0}`],
          },
          audit: {
            connectorId: this.id,
            connectorVersion: this.version,
            inputHash,
          },
          error: `Sheet not found: ${config.sheetName || config.sheetIndex || 0}`,
        };
      }

      // Convert worksheet to array of arrays
      const jsonData: unknown[][] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, _rowNumber) => {
        const rowValues: unknown[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          // Pad with nulls if there are gaps
          while (rowValues.length < colNumber - 1) {
            rowValues.push(null);
          }
          // Handle different cell value types
          let value = cell.value;
          if (value && typeof value === 'object' && 'result' in value) {
            // Formula cell - use the result
            value = value.result;
          }
          if (value && typeof value === 'object' && 'richText' in value) {
            // Rich text - extract plain text
            value = (value.richText as Array<{ text: string }>).map(t => t.text).join('');
          }
          rowValues.push(value);
        });
        jsonData.push(rowValues);
      });

      const headerRowIndex = (config.headerRow || 1) - 1;
      const startRowIndex = (config.startRow || 2) - 1;

      if (jsonData.length <= headerRowIndex) {
        return {
          success: false,
          records: [],
          metadata: {
            sourceType: 'excel',
            extractionTimestamp: new Date(),
            confidence: 0,
            warnings: ['File has no data rows'],
          },
          audit: {
            connectorId: this.id,
            connectorVersion: this.version,
            inputHash,
          },
          error: 'File has no data rows',
        };
      }

      // Get headers and create column index map
      const headers = jsonData[headerRowIndex] as string[];
      const columnIndexMap = new Map<string, number>();
      headers.forEach((header, index) => {
        if (header) {
          columnIndexMap.set(String(header).trim().toLowerCase(), index);
        }
      });

      // Helper to get column index
      const getColumnIndex = (columnName: string | undefined): number | undefined => {
        if (!columnName) return undefined;
        const normalized = columnName.trim().toLowerCase();
        return columnIndexMap.get(normalized);
      };

      // Parse rows
      const records: ExtractedCostRecord[] = [];
      const mappings = config.columnMappings;

      for (let i = startRowIndex; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown[];

        // Skip empty rows
        if (config.skipEmptyRows !== false && (!row || row.every(cell => cell === null || cell === ''))) {
          continue;
        }

        try {
          const parsed = parseRow(row, mappings, getColumnIndex, config, i + 1);
          if (parsed) {
            const record = createCostRecord(parsed, input.filename || 'unknown', inputHash);
            records.push(record);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          warnings.push(`Row ${i + 1}: ${message}`);
        }
      }

      const confidence = records.length > 0 ? Math.min(0.9, 0.5 + (records.length / (jsonData.length - startRowIndex)) * 0.4) : 0;

      return {
        success: true,
        records,
        metadata: {
          sourceType: 'excel',
          extractionTimestamp: new Date(),
          confidence,
          warnings,
          rawData: {
            sheetName,
            totalRows: jsonData.length - startRowIndex,
            extractedRows: records.length,
            processingTimeMs: Date.now() - startTime,
          },
        },
        audit: {
          connectorId: this.id,
          connectorVersion: this.version,
          inputHash,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        records: [],
        metadata: {
          sourceType: 'excel',
          extractionTimestamp: new Date(),
          confidence: 0,
          warnings: [message],
        },
        audit: {
          connectorId: this.id,
          connectorVersion: this.version,
          inputHash: input.buffer ? createHash('sha256').update(input.buffer).digest('hex') : '',
        },
        error: message,
      };
    }
  },

  validateConfig(config: unknown): ValidationResult {
    const errors: string[] = [];
    const cfg = config as Partial<ExcelExtractionConfig>;

    if (!cfg.columnMappings) {
      errors.push('columnMappings is required');
    } else {
      if (!cfg.columnMappings.periodStart) {
        errors.push('columnMappings.periodStart is required');
      }
      if (!cfg.columnMappings.amount) {
        errors.push('columnMappings.amount is required');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  async testConnection(): Promise<ConnectionTestResult> {
    // File-based connector doesn't need connection test
    return {
      success: true,
      message: 'Excel connector is ready for file processing',
    };
  },
};

/**
 * Parse a single row from Excel data
 */
function parseRow(
  row: unknown[],
  mappings: ExcelColumnMappings,
  getColumnIndex: (col: string | undefined) => number | undefined,
  config: ExcelExtractionConfig,
  rowIndex: number
): ParsedRow | null {
  const getValue = (columnName: string | undefined): unknown => {
    const index = getColumnIndex(columnName);
    return index !== undefined ? row[index] : undefined;
  };

  // Parse date
  const periodStartValue = getValue(mappings.periodStart);
  if (!periodStartValue) {
    throw new Error('Missing period start date');
  }
  const periodStart = parseDate(periodStartValue, config.dateFormat);
  if (!periodStart) {
    throw new Error(`Invalid period start date: ${periodStartValue}`);
  }

  const periodEndValue = getValue(mappings.periodEnd);
  const periodEnd = periodEndValue ? parseDate(periodEndValue, config.dateFormat) : periodStart;
  if (!periodEnd) {
    throw new Error(`Invalid period end date: ${periodEndValue}`);
  }

  // Parse amount
  const amountValue = getValue(mappings.amount);
  if (amountValue === null || amountValue === undefined || amountValue === '') {
    throw new Error('Missing amount');
  }
  const amount = parseNumber(amountValue, config.decimalSeparator);
  if (isNaN(amount)) {
    throw new Error(`Invalid amount: ${amountValue}`);
  }

  // Parse optional numeric fields
  const amountNet = parseOptionalNumber(getValue(mappings.amountNet), config.decimalSeparator);
  const vatAmount = parseOptionalNumber(getValue(mappings.vatAmount), config.decimalSeparator);
  const quantity = parseOptionalNumber(getValue(mappings.quantity), config.decimalSeparator);
  const pricePerUnit = parseOptionalNumber(getValue(mappings.pricePerUnit), config.decimalSeparator);

  return {
    periodStart,
    periodEnd,
    amount,
    amountNet,
    vatAmount,
    quantity,
    unit: getValue(mappings.unit) as string | undefined,
    pricePerUnit,
    costType: getValue(mappings.costType) as string | undefined,
    supplierName: getValue(mappings.supplierName) as string | undefined,
    invoiceNumber: getValue(mappings.invoiceNumber) as string | undefined,
    location: getValue(mappings.location) as string | undefined,
    contractNumber: getValue(mappings.contractNumber) as string | undefined,
    meterNumber: getValue(mappings.meterNumber) as string | undefined,
    currency: (getValue(mappings.currency) as string) || 'EUR',
    rowIndex,
  };
}

/**
 * Parse a date value
 */
function parseDate(value: unknown, format?: string): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    // Excel serial date
    const date = new Date((value - 25569) * 86400 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    // Try common German formats
    const patterns = [
      /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/,   // YYYY-MM-DD
    ];

    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) {
        if (pattern.source.startsWith('^(\\d{4})')) {
          // YYYY-MM-DD
          return new Date(parseInt(match[1]!), parseInt(match[2]!) - 1, parseInt(match[3]!));
        } else {
          // DD.MM.YYYY or DD/MM/YYYY
          return new Date(parseInt(match[3]!), parseInt(match[2]!) - 1, parseInt(match[1]!));
        }
      }
    }

    // Try native parsing
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Parse a number value
 */
function parseNumber(value: unknown, decimalSeparator?: '.' | ','): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    let normalized = value.trim();

    // Auto-detect decimal separator if not specified
    if (!decimalSeparator) {
      const lastComma = normalized.lastIndexOf(',');
      const lastDot = normalized.lastIndexOf('.');

      if (lastComma > lastDot) {
        decimalSeparator = ',';
      } else {
        decimalSeparator = '.';
      }
    }

    if (decimalSeparator === ',') {
      // German format: 1.234,56 -> 1234.56
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      // English format: 1,234.56 -> 1234.56
      normalized = normalized.replace(/,/g, '');
    }

    return parseFloat(normalized);
  }

  return NaN;
}

/**
 * Parse an optional number value
 */
function parseOptionalNumber(value: unknown, decimalSeparator?: '.' | ','): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const num = parseNumber(value, decimalSeparator);
  return isNaN(num) ? undefined : num;
}

/**
 * Create a cost record from parsed row data
 */
function createCostRecord(
  parsed: ParsedRow,
  filename: string,
  inputHash: string
): ExtractedCostRecord {
  // Map cost type string to CostType enum
  const costType = mapCostType(parsed.costType);

  return {
    externalId: `excel-${inputHash.substring(0, 8)}-${parsed.rowIndex}`,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    amount: parsed.amount,
    currency: parsed.currency,
    amountNet: parsed.amountNet,
    vatAmount: parsed.vatAmount,
    quantity: parsed.quantity,
    unit: mapUnit(parsed.unit),
    pricePerUnit: parsed.pricePerUnit,
    costType,
    sourceDocumentId: undefined,
    sourceLocation: {
      rawText: `Row ${parsed.rowIndex}`,
    },
    supplier: {
      name: parsed.supplierName || 'Unknown Supplier',
    },
    locationId: parsed.location,
    contractNumber: parsed.contractNumber,
    meterNumber: parsed.meterNumber,
    confidence: 0.8,
    manuallyVerified: false,
    extractionMethod: 'template',
  };
}

/**
 * Map cost type string to CostType enum
 */
function mapCostType(type: string | undefined): CostType {
  if (!type) return 'other';

  const normalized = type.toLowerCase().trim();
  const mappings: Record<string, CostType> = {
    // Electricity
    'electricity': 'electricity',
    'strom': 'electricity',
    'elektrizität': 'electricity',
    // Gas
    'gas': 'natural_gas',
    'erdgas': 'natural_gas',
    'natural_gas': 'natural_gas',
    // Water
    'water': 'water',
    'wasser': 'water',
    // Heating
    'heating': 'district_heating',
    'heizung': 'district_heating',
    'fernwärme': 'district_heating',
    'heating_oil': 'heating_oil',
    'heizöl': 'heating_oil',
    // Cooling
    'cooling': 'district_cooling',
    'kühlung': 'district_cooling',
    'klimatisierung': 'district_cooling',
    // Waste
    'waste': 'waste',
    'abfall': 'waste',
    'entsorgung': 'waste',
    // Facility services -> operating_costs
    'cleaning': 'operating_costs',
    'reinigung': 'operating_costs',
    'security': 'operating_costs',
    'sicherheit': 'operating_costs',
    // Maintenance
    'maintenance': 'maintenance',
    'wartung': 'maintenance',
    'instandhaltung': 'maintenance',
    // Rent
    'rent': 'rent',
    'miete': 'rent',
    // Insurance
    'insurance': 'insurance',
    'versicherung': 'insurance',
    // Telecom
    'telecom': 'telecom_landline',
    'telekommunikation': 'telecom_landline',
    'telefon': 'telecom_landline',
    'internet': 'telecom_internet',
    'mobile': 'telecom_mobile',
    'mobilfunk': 'telecom_mobile',
    // IT
    'it_services': 'it_cloud',
    'it-services': 'it_cloud',
    'it': 'it_cloud',
    'it_licenses': 'it_licenses',
    'lizenzen': 'it_licenses',
    'it_hardware': 'it_hardware',
    'hardware': 'it_hardware',
  };

  return mappings[normalized] || 'other';
}

/**
 * Map unit string to ConsumptionUnit
 */
function mapUnit(unit: string | undefined): ConsumptionUnit | undefined {
  if (!unit) return undefined;

  const normalized = unit.toLowerCase().trim();
  const mappings: Record<string, ConsumptionUnit> = {
    'kwh': 'kWh',
    'mwh': 'MWh',
    'm³': 'm³',
    'm3': 'm³',
    'kubikmeter': 'm³',
    'liter': 'liter',
    'l': 'liter',
    'kg': 'kg',
    't': 'tonne',
    'tonne': 'tonne',
    'tonnen': 'tonne',
    'stück': 'piece',
    'stk': 'piece',
    'pcs': 'piece',
    'user': 'user',
    'benutzer': 'user',
    'gb': 'GB',
  };

  return mappings[normalized];
}

export default excelConnector;
