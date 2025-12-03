import type { CostType, ConsumptionUnit, ExtractionMethod } from '@cost-watchdog/core';

/**
 * Connector type classification.
 */
export type ConnectorType = 'file' | 'api' | 'manual' | 'iot' | 'email';

/**
 * JSON Schema type for configuration validation.
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  [key: string]: unknown;
}

/**
 * Input provided to a connector for extraction.
 */
export interface ConnectorInput {
  /** Raw file buffer (for file-based connectors) */
  buffer?: Buffer;
  /** File name */
  filename?: string;
  /** MIME type */
  mimeType?: string;
  /** API endpoint (for API connectors) */
  endpoint?: string;
  /** API credentials */
  credentials?: Record<string, string>;
  /** Additional connector-specific config */
  config?: Record<string, unknown>;
}

/**
 * Bounding box for source location in document.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Source location within a document.
 */
export interface SourceLocation {
  page?: number;
  coordinates?: BoundingBox;
  rawText?: string;
}

/**
 * Supplier information extracted from a document.
 */
export interface ExtractedSupplier {
  name: string;
  supplierId?: string;
  taxId?: string;
}

/**
 * Cost record extracted by a connector.
 * This is the standardized output format for all connectors.
 */
export interface ExtractedCostRecord {
  // Identification
  externalId?: string;

  // Period
  periodStart: Date;
  periodEnd: Date;
  invoiceDate?: Date;
  dueDate?: Date;

  // Costs
  amount: number;
  currency: string;
  amountNet?: number;
  vatAmount?: number;
  vatRate?: number;

  // Consumption (if applicable)
  quantity?: number;
  unit?: ConsumptionUnit;
  pricePerUnit?: number;

  // Classification
  costType: CostType;
  costCategory?: string;

  // Source
  sourceDocumentId?: string;
  sourceLocation?: SourceLocation;

  // Supplier
  supplier: ExtractedSupplier;

  // Assignment
  locationId?: string;
  costCenterId?: string;
  contractId?: string;

  // Metadata
  meterNumber?: string;
  contractNumber?: string;
  customerNumber?: string;

  // Quality
  confidence: number;
  manuallyVerified: boolean;
  extractionMethod: ExtractionMethod;
}

/**
 * Audit information for extraction traceability.
 */
export interface ExtractionAudit {
  connectorId: string;
  connectorVersion: string;
  inputHash: string;
  // LLM-specific audit fields
  llmModel?: string;
  llmPromptVersion?: string;
  llmTemperature?: number;
  llmResponseHash?: string;
}

/**
 * Metadata about the extraction process.
 */
export interface ExtractionMetadata {
  sourceType: string;
  extractionTimestamp: Date;
  confidence: number;
  warnings: string[];
  rawData?: unknown;
}

/**
 * Result returned by a connector's extract method.
 */
export interface ExtractionResult {
  success: boolean;
  records: ExtractedCostRecord[];
  metadata: ExtractionMetadata;
  audit: ExtractionAudit;
  error?: string;
}

/**
 * Result of configuration validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Result of connection test.
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

/**
 * Base interface that all connectors must implement.
 * Enables plugin architecture without core changes.
 *
 * IMPORTANT: Connectors MUST NOT have side effects!
 * They only extract and return data. The Ingestion Service
 * handles validation, deduplication, storage, and events.
 */
export interface Connector {
  /** Unique connector ID */
  id: string;

  /** Display name */
  name: string;

  /** Connector type */
  type: ConnectorType;

  /** Cost types this connector can extract */
  supportedCostTypes: CostType[];

  /** Version for compatibility tracking */
  version: string;

  /** JSON Schema for connector configuration */
  configSchema: JSONSchema;

  /**
   * Extract cost data from source.
   * @returns Standardized extraction result
   */
  extract(input: ConnectorInput): Promise<ExtractionResult>;

  /**
   * Validate connector configuration.
   */
  validateConfig(config: unknown): ValidationResult;

  /**
   * Test connection to data source.
   */
  testConnection(config: unknown): Promise<ConnectionTestResult>;
}

/**
 * Registry for managing connectors.
 */
export interface ConnectorRegistry {
  register(connector: Connector): void;
  get(id: string): Connector | undefined;
  getAll(): Connector[];
  getByType(type: ConnectorType): Connector[];
  getByCostType(costType: CostType): Connector[];
}
