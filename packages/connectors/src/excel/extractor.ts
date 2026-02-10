import { createHash } from 'crypto';
import type { ConnectorInput, ExtractionResult } from '@cost-watchdog/connector-sdk';
import { createExtractedCostRecord } from '../common/record-factory.js';
import { createExcelColumnResolver, parseExcelRow } from './parser.js';
import type { ExcelExtractionConfig } from './types.js';
import { loadWorkbook, selectWorksheet, worksheetToRows } from './workbook.js';

const CONNECTOR_ID = 'excel';
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
      sourceType: 'excel',
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

export async function extractExcel(input: ConnectorInput): Promise<ExtractionResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const extractionTimestamp = new Date();

  try {
    if (!input.buffer) {
      return createExtractionError('', 'No file buffer provided', 'No file buffer provided');
    }

    const inputHash = getInputHash(input);
    const config = (input.config || {}) as unknown as ExcelExtractionConfig;
    if (!config.columnMappings?.periodStart || !config.columnMappings?.amount) {
      return createExtractionError(
        inputHash,
        'Missing required column mappings: periodStart and amount',
        'Missing required column mappings',
        extractionTimestamp,
      );
    }

    const workbook = await loadWorkbook(input.buffer);
    const worksheet = selectWorksheet(workbook, config);
    if (!worksheet) {
      const sheetRef = config.sheetName || String(config.sheetIndex ?? 0);
      return createExtractionError(
        inputHash,
        `Sheet not found: ${sheetRef}`,
        `Sheet not found: ${sheetRef}`,
        extractionTimestamp,
      );
    }

    const rows = worksheetToRows(worksheet);
    const headerRowIndex = (config.headerRow || 1) - 1;
    const startRowIndex = (config.startRow || 2) - 1;
    const headerRow = rows[headerRowIndex];

    if (!headerRow) {
      return createExtractionError(
        inputHash,
        'File has no data rows',
        'File has no data rows',
        extractionTimestamp,
      );
    }

    const resolveColumn = createExcelColumnResolver(headerRow);
    const records = [];

    for (let i = startRowIndex; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) {
        continue;
      }

      if (
        config.skipEmptyRows !== false &&
        row.every((cell) => cell === null || cell === undefined || cell === '')
      ) {
        continue;
      }

      try {
        const parsed = parseExcelRow(row, config.columnMappings, resolveColumn, config, i + 1);
        records.push(createExtractedCostRecord(parsed, 'excel', inputHash));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`Row ${i + 1}: ${message}`);
      }
    }

    const totalRows = Math.max(rows.length - startRowIndex, 0);
    const confidence =
      records.length > 0 && totalRows > 0
        ? Math.min(0.9, 0.5 + (records.length / totalRows) * 0.4)
        : 0;

    return {
      success: true,
      records,
      metadata: {
        sourceType: 'excel',
        extractionTimestamp,
        confidence,
        warnings,
        rawData: {
          sheetName: worksheet.name,
          totalRows,
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
