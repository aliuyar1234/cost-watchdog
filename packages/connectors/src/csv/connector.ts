import type {
  ConnectionTestResult,
  Connector,
  ConnectorInput,
  ExtractionResult,
  ValidationResult,
} from '@cost-watchdog/connector-sdk';
import { SUPPORTED_COST_TYPES } from '../common/mappings.js';
import { extractCsv } from './extractor.js';
import { csvConfigSchema } from './schema.js';
import type { CsvExtractionConfig } from './types.js';

const CONNECTOR_ID = 'csv';
const CONNECTOR_VERSION = '1.0.0';

export function validateCsvConfig(config: unknown): ValidationResult {
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
}

async function testCsvConnection(): Promise<ConnectionTestResult> {
  return {
    success: true,
    message: 'CSV connector is ready for file processing',
  };
}

async function extractCsvData(input: ConnectorInput): Promise<ExtractionResult> {
  return extractCsv(input);
}

export const csvConnector: Connector = {
  id: CONNECTOR_ID,
  name: 'CSV Connector',
  type: 'file',
  supportedCostTypes: SUPPORTED_COST_TYPES,
  version: CONNECTOR_VERSION,
  configSchema: csvConfigSchema,
  extract: extractCsvData,
  validateConfig: validateCsvConfig,
  testConnection: testCsvConnection,
};
