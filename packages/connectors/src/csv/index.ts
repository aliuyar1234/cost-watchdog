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
 * CSV extraction configuration
 */
export interface CsvExtractionConfig {
  /** Delimiter character (default: auto-detect from ; , or tab) */
  delimiter?: string;
  /** Quote character (default: ") */
  quoteChar?: string;
  /** Whether first row contains headers (default: true) */
  hasHeader?: boolean;
  /** Row containing headers (1-based, default: 1) */
  headerRow?: number;
  /** First data row (1-based, default: 2) */
  startRow?: number;
  /** File encoding (default: utf-8) */
  encoding?: string;
  /** Column mappings */
  columnMappings: CsvColumnMappings;
  /** Date format in the file (default: auto-detect) */
  dateFormat?: string;
  /** Decimal separator (default: auto-detect) */
  decimalSeparator?: '.' | ',';
  /** Skip empty rows */
  skipEmptyRows?: boolean;
}

/**
 * Column mappings for CSV extraction
 * Can be column name (if hasHeader) or column index (0-based)
 */
export interface CsvColumnMappings {
  /** Column for period start date (required) */
  periodStart: string | number;
  /** Column for period end date (optional, defaults to periodStart) */
  periodEnd?: string | number;
  /** Column for amount (required) */
  amount: string | number;
  /** Column for net amount */
  amountNet?: string | number;
  /** Column for VAT amount */
  vatAmount?: string | number;
  /** Column for quantity/consumption */
  quantity?: string | number;
  /** Column for unit */
  unit?: string | number;
  /** Column for price per unit */
  pricePerUnit?: string | number;
  /** Column for cost type */
  costType?: string | number;
  /** Column for supplier name */
  supplierName?: string | number;
  /** Column for invoice number */
  invoiceNumber?: string | number;
  /** Column for location/site identifier */
  location?: string | number;
  /** Column for contract number */
  contractNumber?: string | number;
  /** Column for meter number */
  meterNumber?: string | number;
  /** Column for currency */
  currency?: string | number;
}

/**
 * Result of parsing a CSV row
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
 * CSV connector for extracting cost data from CSV files
 *
 * IMPORTANT: This connector only extracts data - no side effects!
 * The Ingestion Service handles validation, deduplication, storage, and events.
 */
export const csvConnector: Connector = {
  id: 'csv',
  name: 'CSV Connector',
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
      delimiter: { type: 'string' },
      quoteChar: { type: 'string' },
      hasHeader: { type: 'boolean' },
      headerRow: { type: 'number' },
      startRow: { type: 'number' },
      encoding: { type: 'string' },
      dateFormat: { type: 'string' },
      decimalSeparator: { type: 'string', enum: ['.', ','] },
      skipEmptyRows: { type: 'boolean' },
      columnMappings: {
        type: 'object',
        properties: {
          periodStart: { type: ['string', 'number'] },
          periodEnd: { type: ['string', 'number'] },
          amount: { type: ['string', 'number'] },
          amountNet: { type: ['string', 'number'] },
          vatAmount: { type: ['string', 'number'] },
          quantity: { type: ['string', 'number'] },
          unit: { type: ['string', 'number'] },
          pricePerUnit: { type: ['string', 'number'] },
          costType: { type: ['string', 'number'] },
          supplierName: { type: ['string', 'number'] },
          invoiceNumber: { type: ['string', 'number'] },
          location: { type: ['string', 'number'] },
          contractNumber: { type: ['string', 'number'] },
          meterNumber: { type: ['string', 'number'] },
          currency: { type: ['string', 'number'] },
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
            sourceType: 'csv',
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
      const config = (input.config || {}) as unknown as CsvExtractionConfig;

      // Validate required config
      if (!config.columnMappings?.periodStart || !config.columnMappings?.amount) {
        return {
          success: false,
          records: [],
          metadata: {
            sourceType: 'csv',
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

      // Decode buffer to string
      const encoding = config.encoding || 'utf-8';
      const content = input.buffer.toString(encoding as BufferEncoding);

      // Detect or use configured delimiter
      const delimiter = config.delimiter || detectDelimiter(content);

      // Parse CSV
      const rows = parseCSV(content, delimiter, config.quoteChar || '"');

      if (rows.length === 0) {
        return {
          success: false,
          records: [],
          metadata: {
            sourceType: 'csv',
            extractionTimestamp: new Date(),
            confidence: 0,
            warnings: ['File is empty'],
          },
          audit: {
            connectorId: this.id,
            connectorVersion: this.version,
            inputHash,
          },
          error: 'File is empty',
        };
      }

      const hasHeader = config.hasHeader !== false;
      const headerRowIndex = hasHeader ? (config.headerRow || 1) - 1 : -1;
      const startRowIndex = hasHeader ? (config.startRow || 2) - 1 : 0;

      // Build column index map
      let columnIndexMap: Map<string, number>;
      if (hasHeader && rows[headerRowIndex]) {
        columnIndexMap = new Map();
        rows[headerRowIndex].forEach((header, index) => {
          if (header) {
            columnIndexMap.set(String(header).trim().toLowerCase(), index);
          }
        });
      } else {
        columnIndexMap = new Map();
      }

      // Helper to get column index
      const getColumnIndex = (mapping: string | number | undefined): number | undefined => {
        if (mapping === undefined) return undefined;
        if (typeof mapping === 'number') return mapping;
        return columnIndexMap.get(mapping.toLowerCase());
      };

      // Parse rows
      const records: ExtractedCostRecord[] = [];
      const mappings = config.columnMappings;

      for (let i = startRowIndex; i < rows.length; i++) {
        const row = rows[i];

        // Skip empty rows
        if (config.skipEmptyRows !== false && (!row || row.every(cell => !cell || cell.trim() === ''))) {
          continue;
        }

        try {
          const parsed = parseRow(row!, mappings, getColumnIndex, config, i + 1);
          if (parsed) {
            const record = createCostRecord(parsed, input.filename || 'unknown', inputHash);
            records.push(record);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          warnings.push(`Row ${i + 1}: ${message}`);
        }
      }

      const totalDataRows = rows.length - startRowIndex;
      const confidence = records.length > 0 ? Math.min(0.9, 0.5 + (records.length / totalDataRows) * 0.4) : 0;

      return {
        success: true,
        records,
        metadata: {
          sourceType: 'csv',
          extractionTimestamp: new Date(),
          confidence,
          warnings,
          rawData: {
            delimiter,
            totalRows: totalDataRows,
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
          sourceType: 'csv',
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
    const cfg = config as Partial<CsvExtractionConfig>;

    if (!cfg.columnMappings) {
      errors.push('columnMappings is required');
    } else {
      if (cfg.columnMappings.periodStart === undefined) {
        errors.push('columnMappings.periodStart is required');
      }
      if (cfg.columnMappings.amount === undefined) {
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
      message: 'CSV connector is ready for file processing',
    };
  },
};

/**
 * Detect the delimiter used in a CSV file
 */
function detectDelimiter(content: string): string {
  const firstLines = content.split('\n').slice(0, 5).join('\n');

  const delimiters = [';', ',', '\t', '|'];
  let bestDelimiter = ',';
  let maxCount = 0;

  for (const delimiter of delimiters) {
    const count = (firstLines.match(new RegExp(delimiter.replace(/[|\\]/g, '\\$&'), 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string, delimiter: string, quoteChar: string): string[][] {
  const rows: string[][] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (!inQuotes && char === quoteChar) {
        inQuotes = true;
      } else if (inQuotes && char === quoteChar) {
        if (nextChar === quoteChar) {
          // Escaped quote
          current += quoteChar;
          i++;
        } else {
          inQuotes = false;
        }
      } else if (!inQuotes && char === delimiter) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single row from CSV data
 */
function parseRow(
  row: string[],
  mappings: CsvColumnMappings,
  getColumnIndex: (col: string | number | undefined) => number | undefined,
  config: CsvExtractionConfig,
  rowIndex: number
): ParsedRow | null {
  const getValue = (mapping: string | number | undefined): string | undefined => {
    const index = getColumnIndex(mapping);
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
  if (!amountValue) {
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
    unit: getValue(mappings.unit),
    pricePerUnit,
    costType: getValue(mappings.costType),
    supplierName: getValue(mappings.supplierName),
    invoiceNumber: getValue(mappings.invoiceNumber),
    location: getValue(mappings.location),
    contractNumber: getValue(mappings.contractNumber),
    meterNumber: getValue(mappings.meterNumber),
    currency: getValue(mappings.currency) || 'EUR',
    rowIndex,
  };
}

/**
 * Parse a date value
 */
function parseDate(value: string, format?: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Try common German formats
  const patterns = [
    { regex: /^(\d{2})\.(\d{2})\.(\d{4})$/, parts: [3, 2, 1] },   // DD.MM.YYYY
    { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, parts: [3, 2, 1] },   // DD/MM/YYYY
    { regex: /^(\d{4})-(\d{2})-(\d{2})$/, parts: [1, 2, 3] },     // YYYY-MM-DD
    { regex: /^(\d{2})-(\d{2})-(\d{4})$/, parts: [3, 2, 1] },     // DD-MM-YYYY
  ];

  for (const { regex, parts } of patterns) {
    const match = trimmed.match(regex);
    if (match) {
      const year = parseInt(match[parts[0]!]!);
      const month = parseInt(match[parts[1]!]!) - 1;
      const day = parseInt(match[parts[2]!]!);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try native parsing
  const date = new Date(trimmed);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse a number value
 */
function parseNumber(value: string, decimalSeparator?: '.' | ','): number {
  let normalized = value.trim();

  // Remove currency symbols
  normalized = normalized.replace(/[€$£¥]/g, '').trim();

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

/**
 * Parse an optional number value
 */
function parseOptionalNumber(value: string | undefined, decimalSeparator?: '.' | ','): number | undefined {
  if (!value || value.trim() === '') {
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
  const costType = mapCostType(parsed.costType);

  return {
    externalId: `csv-${inputHash.substring(0, 8)}-${parsed.rowIndex}`,
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
    'piece': 'piece',
    'user': 'user',
    'benutzer': 'user',
    'gb': 'GB',
  };

  return mappings[normalized];
}

export default csvConnector;
