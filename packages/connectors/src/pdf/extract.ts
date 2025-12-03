import type {
  ExtractionResult,
  ConnectorInput,
  ExtractedCostRecord,
} from '@cost-watchdog/connector-sdk';
import { createHash } from 'crypto';
import {
  extractTextFromPdf,
  isScannedPdf,
  type TextExtractionResult,
} from './text-extractor.js';
import {
  detectSupplier,
  extractUnknownSupplierName,
  type SupplierDetectionResult,
} from './supplier-detector.js';
import { getTemplate, extractGenericUtility } from './templates/index.js';
import { extractWithLLM, type LLMExtractionConfig } from './llm-extractor.js';

/**
 * PDF extraction configuration.
 */
export interface PdfExtractionConfig {
  /** Use LLM fallback if template extraction fails */
  useLlmFallback?: boolean;
  /** Anthropic API key for LLM extraction */
  anthropicApiKey?: string;
  /** Force LLM extraction (skip template) */
  forceLlm?: boolean;
  /** Minimum confidence threshold for auto-acceptance */
  minConfidence?: number;
}

/**
 * Main entry point for PDF extraction.
 *
 * Flow:
 * 1. Extract text from PDF (pdf.js)
 * 2. Detect supplier via patterns (name, UID, IBAN)
 * 3. If known supplier -> use template parser
 * 4. If unknown or template fails -> use LLM extraction
 * 5. Validate extracted data
 * 6. Return ExtractionResult
 */
export async function extractFromPdf(
  input: ConnectorInput,
  config: PdfExtractionConfig = {}
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const warnings: string[] = [];

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
    // In future: fall back to OCR
  }

  // Step 2: Detect supplier
  const supplierResult = detectSupplier(textResult.fullText);

  let records: Partial<ExtractedCostRecord>[] = [];
  let extractionMethod: 'template' | 'llm' | 'manual' = 'manual';
  let confidence = 0;
  let llmAudit: Record<string, unknown> | undefined;

  // Step 3: Try template extraction if supplier detected
  if (supplierResult.detected && supplierResult.supplier?.templateId && !config.forceLlm) {
    const template = getTemplate(supplierResult.supplier.templateId);

    if (template) {
      const templateResult = template(textResult.pages, textResult.fullText);

      if (templateResult.success && templateResult.records.length > 0) {
        records = templateResult.records;
        extractionMethod = 'template';
        confidence = templateResult.confidence;
        warnings.push(...templateResult.warnings);

        // Add supplier info if not present
        for (const record of records) {
          if (!record.supplier && supplierResult.supplier) {
            record.supplier = {
              name: supplierResult.supplier.name,
              supplierId: supplierResult.supplier.id,
            };
          }
        }
      }
    }
  }

  // Step 4: Fall back to generic template if no supplier-specific template
  if (records.length === 0 && !config.forceLlm) {
    const genericResult = extractGenericUtility(textResult.pages, textResult.fullText);

    if (genericResult.success && genericResult.records.length > 0) {
      records = genericResult.records;
      extractionMethod = 'template';
      confidence = genericResult.confidence;
      warnings.push(...genericResult.warnings);

      // Try to set supplier
      for (const record of records) {
        if (!record.supplier) {
          if (supplierResult.detected && supplierResult.supplier) {
            record.supplier = {
              name: supplierResult.supplier.name,
              supplierId: supplierResult.supplier.id,
            };
          } else {
            const unknownName = extractUnknownSupplierName(textResult.fullText);
            if (unknownName) {
              record.supplier = { name: unknownName };
            }
          }
        }
      }
    }
  }

  // Step 5: LLM fallback if enabled and needed
  const shouldUseLlm =
    config.forceLlm ||
    (config.useLlmFallback &&
      config.anthropicApiKey &&
      (records.length === 0 || confidence < (config.minConfidence || 0.7)));

  if (shouldUseLlm && config.anthropicApiKey) {
    const llmConfig: LLMExtractionConfig = {
      apiKey: config.anthropicApiKey,
    };

    const llmResult = await extractWithLLM(textResult.fullText, llmConfig);

    if (llmResult.success && llmResult.records.length > 0) {
      // Use LLM results if better than template results
      if (llmResult.confidence > confidence || records.length === 0) {
        records = llmResult.records;
        extractionMethod = 'llm';
        confidence = llmResult.confidence;
        warnings.push(...llmResult.warnings);
        llmAudit = llmResult.audit;
      }
    } else if (llmResult.error) {
      warnings.push(`LLM extraction failed: ${llmResult.error}`);
    }
  }

  // Step 6: Validate and finalize records
  const finalRecords: ExtractedCostRecord[] = [];

  for (const partial of records) {
    const validated = validateAndComplete(partial, supplierResult, textResult);
    if (validated) {
      finalRecords.push(validated);
    } else {
      warnings.push('Record failed validation');
    }
  }

  const processingTimeMs = Date.now() - startTime;

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
        supplierDetected: supplierResult.detected,
        supplierMethod: supplierResult.method,
        extractionMethod,
      },
    },
    audit: {
      connectorId: 'pdf',
      connectorVersion: '0.1.0',
      inputHash,
      ...(llmAudit && {
        llmModel: llmAudit['model'] as string,
        llmPromptVersion: llmAudit['promptVersion'] as string,
        llmTemperature: llmAudit['temperature'] as number,
        llmResponseHash: llmAudit['outputHash'] as string,
      }),
    },
    error: finalRecords.length === 0 ? 'No valid records extracted' : undefined,
  };
}

/**
 * Validate and complete a partial record.
 */
function validateAndComplete(
  partial: Partial<ExtractedCostRecord>,
  supplier: SupplierDetectionResult,
  textResult: TextExtractionResult
): ExtractedCostRecord | null {
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
    extractionMethod: partial.extractionMethod || 'template',
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
  inputHash: string = ''
): ExtractionResult {
  return {
    success: false,
    records: [],
    metadata: {
      sourceType: 'pdf',
      extractionTimestamp: new Date(),
      confidence: 0,
      warnings,
    },
    audit: {
      connectorId: 'pdf',
      connectorVersion: '0.1.0',
      inputHash,
    },
    error,
  };
}
