import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { downloadFile } from '../lib/s3.js';
import { prisma } from '../lib/db.js';
import { QUEUE_NAMES, type ExtractionJobData } from '../lib/queues.js';
import { extractFromPdf, type PdfExtractionConfig } from '@cost-watchdog/connectors/pdf';
import { secrets } from '../lib/secrets.js';

/**
 * Process a document extraction job.
 */
async function processExtractionJob(job: Job<ExtractionJobData>): Promise<void> {
  const { documentId, storagePath, mimeType, isBackfill } = job.data;

  console.log(`[Extraction] Processing document ${documentId}`);

  try {
    // Update document status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { extractionStatus: 'processing' },
    });

    // Download file from S3
    const buffer = await downloadFile(storagePath);

    // Determine extraction method based on MIME type
    if (mimeType !== 'application/pdf') {
      throw new Error(`Unsupported MIME type: ${mimeType}. Only PDF is currently supported.`);
    }

    // Configure extraction
    const config: PdfExtractionConfig = {
      useLlmFallback: true,
      anthropicApiKey: secrets.getAnthropicApiKey(),
      minConfidence: 0.7,
    };

    // Extract data from PDF
    const result = await extractFromPdf({ buffer, filename: storagePath }, config);

    if (!result.success || result.records.length === 0) {
      // Mark as failed
      await prisma.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'failed',
          extractionAudit: {
            method: result.audit.connectorId,
            warnings: result.metadata.warnings,
            error: result.error,
            timestamp: new Date().toISOString(),
          },
        },
      });

      throw new Error(result.error || 'No records extracted');
    }

    // Create cost records from extracted data
    for (const extractedRecord of result.records) {
      // Find or create supplier
      let supplier = await prisma.supplier.findFirst({
        where: {
          OR: [
            extractedRecord.supplier.taxId
              ? { taxId: extractedRecord.supplier.taxId }
              : { id: 'never-match' },
            { name: extractedRecord.supplier.name },
          ],
        },
      });

      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            name: extractedRecord.supplier.name,
            taxId: extractedRecord.supplier.taxId,
            category: 'other',
            costTypes: [extractedRecord.costType],
            isActive: true,
          },
        });
      }

      // Create cost record
      const costRecord = await prisma.costRecord.create({
        data: {
          supplierId: supplier.id,
          sourceDocumentId: documentId,
          invoiceNumber: extractedRecord.externalId,
          periodStart: extractedRecord.periodStart,
          periodEnd: extractedRecord.periodEnd,
          invoiceDate: extractedRecord.invoiceDate,
          dueDate: extractedRecord.dueDate,
          amount: extractedRecord.amount,
          currency: extractedRecord.currency,
          amountNet: extractedRecord.amountNet,
          vatAmount: extractedRecord.vatAmount,
          vatRate: extractedRecord.vatRate,
          quantity: extractedRecord.quantity,
          unit: extractedRecord.unit,
          pricePerUnit: extractedRecord.pricePerUnit,
          costType: extractedRecord.costType,
          meterNumber: extractedRecord.meterNumber,
          contractNumber: extractedRecord.contractNumber,
          customerNumber: extractedRecord.customerNumber,
          confidence: extractedRecord.confidence,
          dataQuality: 'extracted',
          extractionMethod: extractedRecord.extractionMethod,
          anomalyStatus: 'ok',
        },
      });

      // Create outbox event for anomaly detection
      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'cost_record',
          aggregateId: costRecord.id,
          eventType: 'cost_record.created',
          payload: {
            costRecordId: costRecord.id,
            amount: costRecord.amount,
            costType: costRecord.costType,
            supplierId: costRecord.supplierId,
            periodStart: costRecord.periodStart.toISOString(),
            periodEnd: costRecord.periodEnd.toISOString(),
            isBackfill: isBackfill || false,
          },
        },
      });

      console.log(
        `[Extraction] Created cost record ${costRecord.id} (${costRecord.amount} ${costRecord.currency})`
      );
    }

    // Update document status
    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractionStatus: 'completed',
        extractedAt: new Date(),
        costTypes: result.records.map((r) => r.costType),
        extractionAudit: {
          method: result.audit.connectorId,
          confidence: result.metadata.confidence,
          recordCount: result.records.length,
          warnings: result.metadata.warnings,
          llmModel: result.audit.llmModel,
          llmPromptVersion: result.audit.llmPromptVersion,
          timestamp: new Date().toISOString(),
        },
      },
    });

    console.log(
      `[Extraction] Completed document ${documentId}: ${result.records.length} records extracted`
    );
  } catch (error) {
    console.error(`[Extraction] Failed for document ${documentId}:`, error);

    // Update document status on error
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'failed',
          extractionAudit: {
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (updateError) {
      console.error(`[Extraction] Failed to update document status:`, updateError);
    }

    throw error;
  }
}

/**
 * Create and start the extraction worker.
 */
export function createExtractionWorker(): Worker<ExtractionJobData> {
  const worker = new Worker<ExtractionJobData>(
    QUEUE_NAMES.EXTRACTION,
    processExtractionJob,
    {
      connection: createRedisConnection(),
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Extraction] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Extraction] Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[Extraction] Worker error:', error);
  });

  console.log('[Extraction] Worker started');

  return worker;
}
