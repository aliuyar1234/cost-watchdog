import type { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import { csvConnector, excelConnector } from '@cost-watchdog/connectors';
import { extractFromPdf, type PdfExtractionConfig } from '@cost-watchdog/connectors/pdf';
import { downloadFile } from '../../lib/s3.js';
import { prisma } from '../../lib/db.js';
import type { ExtractionJobData } from '../../lib/queues.js';
import { secrets } from '../../lib/secrets.js';
import { documentsProcessedTotal } from '../../lib/metrics.js';
import { persistExtractedCostRecords } from '../../services/extraction-persistence.service.js';
import { inferCsvConfig, inferExcelConfig } from './header-inference.js';

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
): Promise<Awaited<ReturnType<typeof csvConnector.extract>> | null> {
  if (mimeType === 'application/pdf') {
    const config: PdfExtractionConfig = {
      useLlmFallback: true,
      anthropicApiKey: secrets.getAnthropicApiKey(),
      minConfidence: 0.7,
    };

    return extractFromPdf({ buffer, filename: storagePath, mimeType }, config);
  }

  if (mimeType === 'text/csv') {
    const inferred = inferCsvConfig(buffer);
    if (!inferred) {
      throw new ExtractionFailure('CSV header mapping could not be inferred', {
        method: 'csv',
        reason: 'missing_required_headers',
        timestamp: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue);
    }

    return csvConnector.extract({
      buffer,
      filename: storagePath,
      mimeType,
      config: inferred.config,
    });
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    const inferred = await inferExcelConfig(buffer);
    if (!inferred) {
      throw new ExtractionFailure('Excel header mapping could not be inferred', {
        method: 'excel',
        reason: 'missing_required_headers',
        timestamp: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue);
    }

    return excelConnector.extract({
      buffer,
      filename: storagePath,
      mimeType,
      config: inferred.config,
    });
  }

  if (mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
    return null;
  }

  throw new Error(`Unsupported MIME type: ${mimeType}`);
}

async function handleManualDocument(documentId: string, mimeType: string): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractionStatus: 'manual',
      extractionAudit: {
        method: 'manual',
        reason: `No automatic extractor available for ${mimeType}`,
        timestamp: new Date().toISOString(),
      } satisfies Prisma.InputJsonValue,
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
    const result = await runExtractionByMimeType(buffer, storagePath, mimeType);

    if (!result) {
      await handleManualDocument(documentId, mimeType);
      return;
    }

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
