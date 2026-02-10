import { createHash } from 'crypto';
import type { ConnectorInput, ExtractionResult } from '@cost-watchdog/connector-sdk';
import { createExtractedCostRecord } from '../common/record-factory.js';
import {
  createCsvColumnResolver,
  detectDelimiter,
  parseCsvContent,
  parseCsvRow,
} from './parser.js';
import type { CsvExtractionConfig } from './types.js';

const CONNECTOR_ID = 'csv';
const CONNECTOR_VERSION = '1.0.0';

function getInputHash(input: ConnectorInput): string {
  return input.buffer ? createHash('sha256').update(input.buffer).digest('hex') : '';
}

function createExtractionError(
  inputHash: string,
  warning: string,
  error: string,
  extractionTimestamp = new Date(),
): ExtractionResult {
  return {
    success: false,
    records: [],
    metadata: {
      sourceType: 'csv',
      extractionTimestamp,
      confidence: 0,
      warnings: [warning],
    },
    audit: {
      connectorId: CONNECTOR_ID,
      connectorVersion: CONNECTOR_VERSION,
      inputHash,
    },
    error,
  };
}

export async function extractCsv(input: ConnectorInput): Promise<ExtractionResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const extractionTimestamp = new Date();

  try {
    if (!input.buffer) {
      return createExtractionError('', 'No file buffer provided', 'No file buffer provided');
    }

    const inputHash = getInputHash(input);
    const config = (input.config || {}) as unknown as CsvExtractionConfig;

    if (
      config.columnMappings?.periodStart === undefined ||
      config.columnMappings?.amount === undefined
    ) {
      return createExtractionError(
        inputHash,
        'Missing required column mappings: periodStart and amount',
        'Missing required column mappings',
        extractionTimestamp,
      );
    }

    const encoding = config.encoding || 'utf-8';
    const content = input.buffer.toString(encoding as BufferEncoding);
    const delimiter = config.delimiter || detectDelimiter(content);
    const rows = parseCsvContent(content, delimiter, config.quoteChar || '"');

    if (rows.length === 0) {
      return createExtractionError(
        inputHash,
        'File is empty',
        'File is empty',
        extractionTimestamp,
      );
    }

    const hasHeader = config.hasHeader !== false;
    const headerRowIndex = hasHeader ? (config.headerRow || 1) - 1 : -1;
    const startRowIndex = hasHeader ? (config.startRow || 2) - 1 : 0;
    const headerRow = hasHeader ? rows[headerRowIndex] : undefined;

    if (hasHeader && !headerRow) {
      return createExtractionError(
        inputHash,
        'Header row not found',
        'Header row not found',
        extractionTimestamp,
      );
    }

    const resolveColumn = createCsvColumnResolver(headerRow, hasHeader);
    const records = [];

    for (let i = startRowIndex; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) {
        continue;
      }

      if (config.skipEmptyRows !== false && row.every((cell) => !cell || cell.trim() === '')) {
        continue;
      }

      try {
        const parsed = parseCsvRow(row, config.columnMappings, resolveColumn, config, i + 1);
        records.push(createExtractedCostRecord(parsed, 'csv', inputHash));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`Row ${i + 1}: ${message}`);
      }
    }

    const totalDataRows = Math.max(rows.length - startRowIndex, 0);
    const confidence =
      records.length > 0 && totalDataRows > 0
        ? Math.min(0.9, 0.5 + (records.length / totalDataRows) * 0.4)
        : 0;

    return {
      success: true,
      records,
      metadata: {
        sourceType: 'csv',
        extractionTimestamp,
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
        connectorId: CONNECTOR_ID,
        connectorVersion: CONNECTOR_VERSION,
        inputHash,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const inputHash = getInputHash(input);
    return createExtractionError(inputHash, message, message, extractionTimestamp);
  }
}
