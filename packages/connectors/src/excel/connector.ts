import type {
  ConnectionTestResult,
  Connector,
  ConnectorInput,
  ExtractionResult,
  ValidationResult,
} from '@cost-watchdog/connector-sdk';
import { SUPPORTED_COST_TYPES } from '../common/mappings.js';
import { extractExcel } from './extractor.js';
import { excelConfigSchema } from './schema.js';
import type { ExcelExtractionConfig } from './types.js';

const CONNECTOR_ID = 'excel';
const CONNECTOR_VERSION = '1.0.0';

export function validateExcelConfig(config: unknown): ValidationResult {
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
}

async function testExcelConnection(): Promise<ConnectionTestResult> {
  return {
    success: true,
    message: 'Excel connector is ready for file processing',
  };
}

async function extractExcelData(input: ConnectorInput): Promise<ExtractionResult> {
  return extractExcel(input);
}

export const excelConnector: Connector = {
  id: CONNECTOR_ID,
  name: 'Excel Connector',
  type: 'file',
  supportedCostTypes: SUPPORTED_COST_TYPES,
  version: CONNECTOR_VERSION,
  configSchema: excelConfigSchema,
  extract: extractExcelData,
  validateConfig: validateExcelConfig,
  testConnection: testExcelConnection,
};
