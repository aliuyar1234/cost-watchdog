import { Worker, Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { createRedisConnection } from '../lib/redis.js';
import { downloadFile } from '../lib/s3.js';
import { prisma } from '../lib/db.js';
import { QUEUE_NAMES, type ExtractionJobData } from '../lib/queues.js';
import {
  csvConnector,
  excelConnector,
  type CsvColumnMappings,
  type ExcelColumnMappings,
} from '@cost-watchdog/connectors';
import { extractFromPdf, type PdfExtractionConfig } from '@cost-watchdog/connectors/pdf';
import { secrets } from '../lib/secrets.js';
import {
  backgroundJobDuration,
  backgroundJobsTotal,
  documentsProcessedTotal,
} from '../lib/metrics.js';

class ExtractionFailure extends Error {
  readonly audit: Prisma.InputJsonValue;

  constructor(message: string, audit: Prisma.InputJsonValue) {
    super(message);
    this.name = 'ExtractionFailure';
    this.audit = audit;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t'] as const;
  let best: (typeof candidates)[number] = ',';
  let bestCount = -1;

  for (const delimiter of candidates) {
    const count = line.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }

  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let idx = 0; idx < line.length; idx++) {
    const char = line[idx];

    if (char === '"') {
      const nextChar = line[idx + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        idx++;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());

  return cells.map((cell, index) => (index === 0 ? cell.replace(/^\uFEFF/, '') : cell));
}

type HeaderCandidateMap<T> = Record<keyof T, string[]>;

const CSV_HEADER_CANDIDATES: HeaderCandidateMap<CsvColumnMappings> = {
  periodStart: ['periodStart', 'period_start', 'start', 'from', 'von', 'beginn', 'date'],
  periodEnd: ['periodEnd', 'period_end', 'end', 'to', 'bis'],
  amount: ['amount', 'betrag', 'sum', 'total', 'kosten'],
  amountNet: ['amountNet', 'amount_net', 'net', 'netto'],
  vatAmount: ['vatAmount', 'vat_amount', 'vat', 'mwst', 'ust'],
  quantity: ['quantity', 'menge', 'verbrauch', 'consumption'],
  unit: ['unit', 'einheit'],
  pricePerUnit: ['pricePerUnit', 'price_per_unit', 'preisproeinheit', 'preis'],
  costType: ['costType', 'cost_type', 'kostenart', 'type'],
  supplierName: ['supplierName', 'supplier_name', 'supplier', 'lieferant'],
  invoiceNumber: ['invoiceNumber', 'invoice_number', 'invoice', 'rechnung', 'rechnungsnummer'],
  location: ['location', 'standort', 'site'],
  contractNumber: ['contractNumber', 'contract_number', 'contract', 'vertrag'],
  meterNumber: ['meterNumber', 'meter_number', 'meter', 'zaehler'],
  currency: ['currency', 'waehrung', 'währung'],
};

const EXCEL_HEADER_CANDIDATES: HeaderCandidateMap<ExcelColumnMappings> = {
  periodStart: CSV_HEADER_CANDIDATES.periodStart,
  periodEnd: CSV_HEADER_CANDIDATES.periodEnd,
  amount: CSV_HEADER_CANDIDATES.amount,
  amountNet: CSV_HEADER_CANDIDATES.amountNet,
  vatAmount: CSV_HEADER_CANDIDATES.vatAmount,
  quantity: CSV_HEADER_CANDIDATES.quantity,
  unit: CSV_HEADER_CANDIDATES.unit,
  pricePerUnit: CSV_HEADER_CANDIDATES.pricePerUnit,
  costType: CSV_HEADER_CANDIDATES.costType,
  supplierName: CSV_HEADER_CANDIDATES.supplierName,
  invoiceNumber: CSV_HEADER_CANDIDATES.invoiceNumber,
  location: CSV_HEADER_CANDIDATES.location,
  contractNumber: CSV_HEADER_CANDIDATES.contractNumber,
  meterNumber: CSV_HEADER_CANDIDATES.meterNumber,
  currency: CSV_HEADER_CANDIDATES.currency,
};

function selectHeaderMatch(lookup: Map<string, string>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeHeader(candidate);
    const match = lookup.get(normalized);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function inferColumnMappings<T extends object>(
  headers: string[],
  candidates: HeaderCandidateMap<T>,
  required: Array<keyof T>,
): Partial<T> | null {
  const lookup = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;
    if (!lookup.has(normalized)) {
      lookup.set(normalized, header);
    }
  }

  const mapping: Record<string, unknown> = {};
  for (const key of Object.keys(candidates) as Array<keyof T>) {
    const match = selectHeaderMatch(lookup, candidates[key]);
    if (match) {
      mapping[key as string] = match;
    }
  }

  for (const key of required) {
    if (!((key as string) in mapping)) {
      return null;
    }
  }

  return mapping as Partial<T>;
}

function inferCsvConfig(buffer: Buffer): {
  config: {
    columnMappings: CsvColumnMappings;
    hasHeader: true;
    headerRow: number;
    startRow: number;
  };
} | null {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return null;
  }

  const firstLine = nonEmpty[0];
  if (!firstLine) {
    return null;
  }

  const delimiter = detectDelimiter(firstLine);

  const scanLimit = Math.min(10, nonEmpty.length);
  for (let idx = 0; idx < scanLimit; idx++) {
    const cells = splitCsvLine(nonEmpty[idx] ?? '', delimiter).filter((value) => value.length > 0);
    if (cells.length < 2) continue;

    const mapping = inferColumnMappings<CsvColumnMappings>(cells, CSV_HEADER_CANDIDATES, [
      'periodStart',
      'amount',
    ]);
    if (mapping) {
      return {
        config: {
          columnMappings: mapping as CsvColumnMappings,
          hasHeader: true,
          headerRow: idx + 1,
          startRow: idx + 2,
        },
      };
    }
  }

  return null;
}

async function inferExcelConfig(buffer: Buffer): Promise<{
  config: {
    columnMappings: ExcelColumnMappings;
    headerRow: number;
    startRow: number;
    skipEmptyRows: true;
  };
} | null> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return null;
  }

  const scanLimit = Math.min(10, worksheet.rowCount);
  for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = Array.isArray(row.values) ? (row.values.slice(1) as unknown[]) : [];
    const headers = values
      .map((value: unknown) => (value === null || value === undefined ? '' : String(value)))
      .map((value: string) => value.trim())
      .filter((value: string) => value.length > 0);

    if (headers.length < 2) continue;

    const mapping = inferColumnMappings<ExcelColumnMappings>(headers, EXCEL_HEADER_CANDIDATES, [
      'periodStart',
      'amount',
    ]);

    if (mapping) {
      return {
        config: {
          columnMappings: mapping as ExcelColumnMappings,
          headerRow: rowNumber,
          startRow: rowNumber + 1,
          skipEmptyRows: true,
        },
      };
    }
  }

  return null;
}

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
    const result = await (async () => {
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

      // Known but not extractable types (store for manual processing)
      if (mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
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
        return null;
      }

      throw new Error(`Unsupported MIME type: ${mimeType}`);
    })();

    if (!result) {
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

    // Create cost records from extracted data
    const locationCache = new Map<string, string | null>();
    const costCenterCache = new Map<string, string | null>();

    for (const extractedRecord of result.records) {
      const costRecord = await prisma.$transaction(async (tx) => {
        const resolveLocationId = async (raw: string | undefined): Promise<string | undefined> => {
          const value = raw?.trim();
          if (!value) return undefined;

          if (locationCache.has(value)) {
            return locationCache.get(value) ?? undefined;
          }

          let resolved: string | null = null;

          if (isUuid(value)) {
            const match = await tx.location.findUnique({
              where: { id: value },
              select: { id: true },
            });
            resolved = match?.id ?? null;
          } else {
            const match = await tx.location.findFirst({
              where: { OR: [{ code: value }, { externalId: value }, { name: value }] },
              select: { id: true },
            });
            resolved = match?.id ?? null;
          }

          locationCache.set(value, resolved);
          return resolved ?? undefined;
        };

        const resolveCostCenterId = async (
          raw: string | undefined,
        ): Promise<string | undefined> => {
          const value = raw?.trim();
          if (!value) return undefined;

          if (costCenterCache.has(value)) {
            return costCenterCache.get(value) ?? undefined;
          }

          let resolved: string | null = null;

          if (isUuid(value)) {
            const match = await tx.costCenter.findUnique({
              where: { id: value },
              select: { id: true },
            });
            resolved = match?.id ?? null;
          } else {
            const match = await tx.costCenter.findUnique({
              where: { code: value },
              select: { id: true },
            });
            resolved = match?.id ?? null;
          }

          costCenterCache.set(value, resolved);
          return resolved ?? undefined;
        };

        const locationId = await resolveLocationId(extractedRecord.locationId);
        const costCenterId = await resolveCostCenterId(extractedRecord.costCenterId);

        // Find or create supplier
        const supplierOr: Prisma.SupplierWhereInput[] = [{ name: extractedRecord.supplier.name }];
        if (extractedRecord.supplier.taxId) {
          supplierOr.unshift({ taxId: extractedRecord.supplier.taxId });
        }

        let supplier = await tx.supplier.findFirst({
          where: { OR: supplierOr },
        });

        if (!supplier) {
          supplier = await tx.supplier.create({
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
        const costRecord = await tx.costRecord.create({
          data: {
            locationId,
            costCenterId,
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
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'cost_record',
            aggregateId: costRecord.id,
            eventType: 'cost_record.created',
            payload: {
              costRecordId: costRecord.id,
              amount: Number(costRecord.amount),
              costType: costRecord.costType,
              supplierId: costRecord.supplierId,
              periodStart: costRecord.periodStart.toISOString(),
              periodEnd: costRecord.periodEnd.toISOString(),
              isBackfill: isBackfill || false,
            },
          },
        });

        return costRecord;
      });

      console.log(
        `[Extraction] Created cost record ${costRecord.id} (${costRecord.amount} ${costRecord.currency})`,
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

    // Update document status on error
    try {
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
  const worker = new Worker<ExtractionJobData>(QUEUE_NAMES.EXTRACTION, processExtractionJob, {
    connection: createRedisConnection(),
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on('completed', (job) => {
    console.log(`[Extraction] Job ${job.id} completed`);
    backgroundJobsTotal.labels(QUEUE_NAMES.EXTRACTION, 'completed').inc();

    if (job.processedOn && job.finishedOn) {
      backgroundJobDuration
        .labels(QUEUE_NAMES.EXTRACTION)
        .observe((job.finishedOn - job.processedOn) / 1000);
    }
  });

  worker.on('failed', (job, error) => {
    console.error(`[Extraction] Job ${job?.id} failed:`, error.message);
    backgroundJobsTotal.labels(QUEUE_NAMES.EXTRACTION, 'failed').inc();

    if (job?.processedOn && job?.finishedOn) {
      backgroundJobDuration
        .labels(QUEUE_NAMES.EXTRACTION)
        .observe((job.finishedOn - job.processedOn) / 1000);
    }
  });

  worker.on('error', (error) => {
    console.error('[Extraction] Worker error:', error);
  });

  console.log('[Extraction] Worker started');

  return worker;
}
