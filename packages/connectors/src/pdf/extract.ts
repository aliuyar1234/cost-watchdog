import type {
  ExtractionResult,
  ConnectorInput,
  ExtractedCostRecord,
} from '@cost-watchdog/connector-sdk';
import { createHash } from 'crypto';
import { extractTextFromPdf, isScannedPdf } from './text-extractor.js';
import {
  extractWithLLM,
  type LLMExtractionAudit,
  type LLMExtractionConfig,
} from './llm-extractor.js';

/**
 * PDF extraction configuration.
 */
export interface PdfExtractionConfig {
  /** Anthropic API key for LLM extraction */
  anthropicApiKey?: string;
  /** Optional model override */
  model?: string;
  /** Optional max token override */
  maxTokens?: number;
  /** Optional temperature override */
  temperature?: number;
  /** Minimum confidence threshold for auto-acceptance */
  minConfidence?: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.7;
const CONNECTOR_ID = 'pdf_llm';
const CONNECTOR_VERSION = '0.1.0';

/**
 * Main entry point for PDF extraction.
 *
 * Flow:
 * 1. Extract text from PDF (pdf.js)
 * 2. Extract structured data via LLM
 * 3. Enforce confidence threshold
 * 4. Validate extracted data
 * 5. Return ExtractionResult
 */
export async function extractFromPdf(
  input: ConnectorInput,
  config: PdfExtractionConfig = {},
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const minConfidence = config.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  // Validate input
  if (!input.buffer) {
    return createErrorResult('No PDF buffer provided', warnings);
  }

  // Calculate input hash
  const inputHash = createHash('sha256').update(input.buffer).digest('hex').substring(0, 32);

  // Step 1: Extract text from PDF
  const textResult = await extractTextFromPdf(input.buffer);

  if (!textResult.success) {
    return createErrorResult(`Text extraction failed: ${textResult.error}`, warnings, inputHash);
  }

  // Check if scanned PDF (needs OCR - not implemented yet)
  if (isScannedPdf(textResult)) {
    warnings.push('PDF appears to be scanned. Text extraction may be incomplete.');
  }

  // Step 2: Run LLM extraction (template parser is intentionally disabled)
  if (!config.anthropicApiKey) {
    return createErrorResult(
      'LLM extraction requires anthropicApiKey',
      warnings,
      inputHash,
      undefined,
      0,
      {
        pageCount: textResult.pageCount,
        processingTimeMs: Date.now() - startTime,
        extractionMethod: 'llm',
      },
    );
  }

  const llmConfig: LLMExtractionConfig = {
    apiKey: config.anthropicApiKey,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };
  const llmResult = await extractWithLLM(textResult.fullText, llmConfig);
  warnings.push(...llmResult.warnings);

  if (!llmResult.success || llmResult.records.length === 0) {
    return createErrorResult(
      llmResult.error ? `LLM extraction failed: ${llmResult.error}` : 'LLM extraction failed',
      warnings,
      inputHash,
      llmResult.audit,
      llmResult.confidence,
      {
        pageCount: textResult.pageCount,
        processingTimeMs: Date.now() - startTime,
        extractionMethod: 'llm',
      },
    );
  }

  if (llmResult.confidence < minConfidence) {
    return createErrorResult(
      `LLM confidence ${llmResult.confidence.toFixed(2)} below threshold ${minConfidence.toFixed(2)}`,
      warnings,
      inputHash,
      llmResult.audit,
      llmResult.confidence,
      {
        pageCount: textResult.pageCount,
        processingTimeMs: Date.now() - startTime,
        extractionMethod: 'llm',
      },
    );
  }

  // Step 3: Validate and finalize records
  const finalRecords: ExtractedCostRecord[] = [];

  for (const partial of llmResult.records) {
    const validated = validateAndComplete(partial);
    if (validated) {
      finalRecords.push(validated);
    } else {
      warnings.push('Record failed validation');
    }
  }

  const processingTimeMs = Date.now() - startTime;
  const extractionMethod: 'llm' | 'manual' = 'llm';
  const confidence = llmResult.confidence;
  const llmAudit = llmResult.audit;

  return {
    success: finalRecords.length > 0,
    records: finalRecords,
    metadata: {
      sourceType: 'pdf',
      extractionTimestamp: new Date(),
      confidence,
      warnings,
      rawData: {
        pageCount: textResult.pageCount,
        processingTimeMs,
        extractionMethod,
      },
    },
    audit: {
      connectorId: CONNECTOR_ID,
      connectorVersion: CONNECTOR_VERSION,
      inputHash,
      ...(llmAudit && {
        llmModel: llmAudit.model,
        llmPromptVersion: llmAudit.promptVersion,
        llmTemperature: llmAudit.temperature,
        llmResponseHash: llmAudit.outputHash,
      }),
    },
    error: finalRecords.length === 0 ? 'No valid records extracted' : undefined,
  };
}

/**
 * Validate and complete a partial record.
 */
function validateAndComplete(partial: Partial<ExtractedCostRecord>): ExtractedCostRecord | null {
  // Required fields check
  if (!partial.amount || partial.amount <= 0) {
    return null;
  }

  if (!partial.periodStart || !partial.periodEnd) {
    return null;
  }

  // Set defaults
  const record: ExtractedCostRecord = {
    periodStart: partial.periodStart,
    periodEnd: partial.periodEnd,
    amount: partial.amount,
    currency: partial.currency || 'EUR',
    costType: partial.costType || 'other',
    supplier: partial.supplier || { name: 'Unknown' },
    confidence: partial.confidence || 0.5,
    manuallyVerified: false,
    extractionMethod: partial.extractionMethod || 'llm',
    // Optional fields
    externalId: partial.externalId,
    invoiceDate: partial.invoiceDate,
    dueDate: partial.dueDate,
    amountNet: partial.amountNet,
    vatAmount: partial.vatAmount,
    vatRate: partial.vatRate,
    quantity: partial.quantity,
    unit: partial.unit,
    pricePerUnit: partial.pricePerUnit,
    costCategory: partial.costCategory,
    meterNumber: partial.meterNumber,
    contractNumber: partial.contractNumber,
    customerNumber: partial.customerNumber,
    locationId: partial.locationId,
    costCenterId: partial.costCenterId,
    contractId: partial.contractId,
    sourceDocumentId: partial.sourceDocumentId,
    sourceLocation: partial.sourceLocation,
  };

  // Plausibility checks
  if (record.amount > 10000000) {
    // > 10M seems suspicious
    record.confidence = Math.min(record.confidence, 0.3);
  }

  if (record.periodEnd < record.periodStart) {
    return null;
  }

  // Period should not be more than 1 year typically
  const daysDiff =
    (record.periodEnd.getTime() - record.periodStart.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 400) {
    record.confidence = Math.min(record.confidence, 0.5);
  }

  return record;
}

/**
 * Create an error result.
 */
function createErrorResult(
  error: string,
  warnings: string[],
  inputHash: string = '',
  llmAudit?: LLMExtractionAudit,
  confidence: number = 0,
  rawData?: Record<string, unknown>,
): ExtractionResult {
  return {
    success: false,
    records: [],
    metadata: {
      sourceType: 'pdf',
      extractionTimestamp: new Date(),
      confidence,
      warnings,
      ...(rawData ? { rawData } : {}),
    },
    audit: {
      connectorId: CONNECTOR_ID,
      connectorVersion: CONNECTOR_VERSION,
      inputHash,
      ...(llmAudit && {
        llmModel: llmAudit.model,
        llmPromptVersion: llmAudit.promptVersion,
        llmTemperature: llmAudit.temperature,
        llmResponseHash: llmAudit.outputHash,
      }),
    },
    error,
  };
}
