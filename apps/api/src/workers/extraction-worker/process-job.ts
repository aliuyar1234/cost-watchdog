import type { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import { csvConnector } from '@cost-watchdog/connectors';
import { extractFromPdf, type PdfExtractionConfig } from '@cost-watchdog/connectors/pdf';
import { downloadFile } from '../../lib/s3.js';
import { prisma } from '../../lib/db.js';
import type { ExtractionJobData } from '../../lib/queues.js';
import {
  CSV_PRIMARY_INGEST_REASON,
  isCsvPrimaryMimeType,
  isLegacyImageMimeType,
  isLegacySpreadsheetMimeType,
  isPdfMimeType,
  PDF_LLM_KEY_MISSING_EXTRACTION_REASON,
} from '../../lib/ingest-policy.js';
import { secrets } from '../../lib/secrets.js';
import { documentsProcessedTotal } from '../../lib/metrics.js';
import { persistExtractedCostRecords } from '../../services/extraction-persistence.service.js';
import { inferCsvConfig } from './header-inference.js';

const PDF_LLM_MIN_CONFIDENCE = 0.75;
const PDF_CRITICAL_WARNING_PATTERNS = [
  /record failed validation/i,
  /invalid/i,
  /mismatch/i,
  /does not equal/i,
  /scanned/i,
  /incomplete/i,
];

type ConnectorExtractionResult = Awaited<ReturnType<typeof csvConnector.extract>>;

interface ExtractionDispatchResult {
  result: ConnectorExtractionResult | null;
  manualAudit?: Prisma.InputJsonValue;
}

function collectCriticalPdfWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) =>
    PDF_CRITICAL_WARNING_PATTERNS.some((pattern) => pattern.test(warning)),
  );
}

class ExtractionFailure extends Error {
  readonly audit: Prisma.InputJsonValue;

  constructor(message: string, audit: Prisma.InputJsonValue) {
    super(message);
    this.name = 'ExtractionFailure';
    this.audit = audit;
  }
}

async function runExtractionByMimeType(
  buffer: Buffer,
  storagePath: string,
  mimeType: string,
): Promise<ExtractionDispatchResult> {
  if (isPdfMimeType(mimeType)) {
    const anthropicApiKey = secrets.getAnthropicApiKey();
    if (!anthropicApiKey) {
      return {
        result: null,
        manualAudit: {
          method: 'pdf_llm',
          reason: PDF_LLM_KEY_MISSING_EXTRACTION_REASON,
          timestamp: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      };
    }

    const config: PdfExtractionConfig = {
      anthropicApiKey,
      minConfidence: PDF_LLM_MIN_CONFIDENCE,
    };
    const pdfResult = await extractFromPdf({ buffer, filename: storagePath, mimeType }, config);

    if (!pdfResult.success || pdfResult.records.length === 0) {
      return {
        result: null,
        manualAudit: {
          method: pdfResult.audit.connectorId,
          reason: pdfResult.error || 'No valid records extracted from PDF via LLM',
          warnings: pdfResult.metadata.warnings,
          confidence: pdfResult.metadata.confidence,
          llmModel: pdfResult.audit.llmModel ?? null,
          llmPromptVersion: pdfResult.audit.llmPromptVersion ?? null,
          timestamp: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      };
    }

    if (pdfResult.records.length !== 1) {
      return {
        result: null,
        manualAudit: {
          method: pdfResult.audit.connectorId,
          reason: `LLM returned ${pdfResult.records.length} records for a single PDF. Manual review required.`,
          warnings: pdfResult.metadata.warnings,
          confidence: pdfResult.metadata.confidence,
          llmModel: pdfResult.audit.llmModel ?? null,
          llmPromptVersion: pdfResult.audit.llmPromptVersion ?? null,
          timestamp: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      };
    }

    const criticalWarnings = collectCriticalPdfWarnings(pdfResult.metadata.warnings);
    if (criticalWarnings.length > 0) {
      return {
        result: null,
        manualAudit: {
          method: pdfResult.audit.connectorId,
          reason: 'PDF extraction flagged ambiguous or invalid fields. Manual review required.',
          warnings: pdfResult.metadata.warnings,
          criticalWarnings,
          confidence: pdfResult.metadata.confidence,
          llmModel: pdfResult.audit.llmModel ?? null,
          llmPromptVersion: pdfResult.audit.llmPromptVersion ?? null,
          timestamp: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      };
    }

    if (pdfResult.metadata.confidence < PDF_LLM_MIN_CONFIDENCE) {
      return {
        result: null,
        manualAudit: {
          method: pdfResult.audit.connectorId,
          reason: `LLM confidence ${pdfResult.metadata.confidence.toFixed(2)} below threshold ${PDF_LLM_MIN_CONFIDENCE.toFixed(2)}`,
          warnings: pdfResult.metadata.warnings,
          confidence: pdfResult.metadata.confidence,
          llmModel: pdfResult.audit.llmModel ?? null,
          llmPromptVersion: pdfResult.audit.llmPromptVersion ?? null,
          timestamp: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      };
    }

    return {
      result: pdfResult,
    };
  }

  if (isCsvPrimaryMimeType(mimeType)) {
    const inferred = inferCsvConfig(buffer);
    if (!inferred) {
      throw new ExtractionFailure('CSV header mapping could not be inferred', {
        method: 'csv',
        reason: 'missing_required_headers',
        timestamp: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue);
    }

    return {
      result: await csvConnector.extract({
        buffer,
        filename: storagePath,
        mimeType,
        config: inferred.config,
      }),
    };
  }

  if (isLegacySpreadsheetMimeType(mimeType)) {
    return {
      result: null,
      manualAudit: {
        method: 'csv_primary',
        reason: CSV_PRIMARY_INGEST_REASON,
        originalMimeType: mimeType,
        timestamp: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue,
    };
  }

  if (isLegacyImageMimeType(mimeType)) {
    return {
      result: null,
      manualAudit: {
        method: 'manual',
        reason: `No automatic extractor available for ${mimeType}`,
        timestamp: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue,
    };
  }

  throw new Error(`Unsupported MIME type: ${mimeType}`);
}

async function handleManualDocument(
  documentId: string,
  audit: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractionStatus: 'manual',
      extractionAudit: audit,
    },
  });

  documentsProcessedTotal.labels('manual').inc();
}

async function markExtractionFailed(documentId: string, error: unknown): Promise<void> {
  const extractionAudit: Prisma.InputJsonValue =
    error instanceof ExtractionFailure
      ? error.audit
      : {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        };

  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractionStatus: 'failed',
      extractionAudit,
    },
  });

  documentsProcessedTotal.labels('failed').inc();
}

export async function processExtractionJob(job: Job<ExtractionJobData>): Promise<void> {
  const { documentId, storagePath, mimeType, isBackfill } = job.data;

  console.log(`[Extraction] Processing document ${documentId}`);

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: { extractionStatus: 'processing' },
    });

    const buffer = await downloadFile(storagePath);
    const dispatch = await runExtractionByMimeType(buffer, storagePath, mimeType);

    if (!dispatch.result) {
      await handleManualDocument(
        documentId,
        dispatch.manualAudit ??
          ({
            method: 'manual',
            reason: `No automatic extractor available for ${mimeType}`,
            timestamp: new Date().toISOString(),
          } satisfies Prisma.InputJsonValue),
      );
      return;
    }

    const result = dispatch.result;

    if (!result.success || result.records.length === 0) {
      throw new ExtractionFailure(result.error || 'No records extracted', {
        method: result.audit.connectorId,
        warnings: result.metadata.warnings,
        error: result.error ?? null,
        timestamp: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue);
    }

    const createdCostRecords = await persistExtractedCostRecords({
      documentId,
      records: result.records,
      isBackfill,
    });

    for (const costRecord of createdCostRecords) {
      console.log(
        `[Extraction] Created cost record ${costRecord.id} (${costRecord.amount} ${costRecord.currency})`,
      );
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractionStatus: 'completed',
        extractedAt: new Date(),
        costTypes: result.records.map((record) => record.costType),
        extractionAudit: {
          method: result.audit.connectorId,
          confidence: result.metadata.confidence,
          recordCount: result.records.length,
          warnings: result.metadata.warnings,
          llmModel: result.audit.llmModel ?? null,
          llmPromptVersion: result.audit.llmPromptVersion ?? null,
          timestamp: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    console.log(
      `[Extraction] Completed document ${documentId}: ${result.records.length} records extracted`,
    );

    documentsProcessedTotal.labels('completed').inc();
  } catch (error) {
    console.error(`[Extraction] Failed for document ${documentId}:`, error);

    try {
      await markExtractionFailed(documentId, error);
    } catch (updateError) {
      console.error('[Extraction] Failed to update document status:', updateError);
    }

    throw error;
  }
}
