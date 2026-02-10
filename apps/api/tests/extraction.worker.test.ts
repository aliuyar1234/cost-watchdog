import { afterEach, describe, it, expect, vi } from 'vitest';
import { Queue, QueueEvents } from 'bullmq';
import { prisma } from './setup';
import { createRedisConnection } from '../src/lib/redis.js';
import { QUEUE_NAMES } from '../src/lib/queues.js';
import { createExtractionWorker } from '../src/workers/extraction.worker.js';
import { downloadFile } from '../src/lib/s3.js';
import { extractFromPdf } from '@cost-watchdog/connectors/pdf';

vi.mock('../src/lib/s3.js', () => ({
  downloadFile: vi.fn(),
}));

vi.mock('@cost-watchdog/connectors/pdf', () => ({
  extractFromPdf: vi.fn(),
}));

describe('ExtractionWorker', () => {
  const downloadFileMock = vi.mocked(downloadFile);
  const extractFromPdfMock = vi.mocked(extractFromPdf);
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    vi.clearAllMocks();

    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    }
  });

  async function runExtractionJob(args: {
    documentId: string;
    storagePath: string;
    mimeType: string;
  }): Promise<void> {
    const queue = new Queue(QUEUE_NAMES.EXTRACTION, { connection: createRedisConnection() });
    const queueEvents = new QueueEvents(QUEUE_NAMES.EXTRACTION, {
      connection: createRedisConnection(),
    });

    await queueEvents.waitUntilReady();

    const worker = createExtractionWorker();

    try {
      const job = await queue.add(
        'extract',
        {
          documentId: args.documentId,
          storagePath: args.storagePath,
          mimeType: args.mimeType,
        },
        { jobId: `test_${args.documentId}` },
      );

      await job.waitUntilFinished(queueEvents, 20000);
    } finally {
      await worker.close();
      await queueEvents.close();
      await queue.close();
    }
  }

  it('extracts a CSV document and creates cost records', async () => {
    const csv = [
      'periodStart,periodEnd,amount,currency,costType,supplierName',
      '2024-01-01,2024-01-31,1000,EUR,electricity,Test Supplier',
      '',
    ].join('\n');
    const buffer = Buffer.from(csv, 'utf8');
    downloadFileMock.mockResolvedValueOnce(buffer);

    const user = await prisma.user.create({
      data: {
        email: 'csv-extraction@test.com',
        passwordHash: 'placeholder',
        firstName: 'CSV',
        lastName: 'User',
        role: 'admin',
      },
    });

    const document = await prisma.document.create({
      data: {
        filename: 'test.csv',
        originalFilename: 'test.csv',
        mimeType: 'text/csv',
        fileSize: buffer.length,
        fileHash: 'csv-extraction-hash',
        storagePath: 'documents/test.csv',
        extractionStatus: 'pending',
        verificationStatus: 'pending',
        uploadedBy: user.id,
      },
    });

    await runExtractionJob({
      documentId: document.id,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
    });

    const updated = await prisma.document.findUnique({ where: { id: document.id } });
    expect(updated?.extractionStatus).toBe('completed');

    const costRecords = await prisma.costRecord.findMany({
      where: { sourceDocumentId: document.id },
    });
    expect(costRecords).toHaveLength(1);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { aggregateType: 'cost_record', aggregateId: costRecords[0]!.id },
    });
    expect(outboxEvents.length).toBeGreaterThan(0);
  }, 30000);

  it('routes Excel documents to manual and enforces CSV-primary ingest', async () => {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['periodStart', 'periodEnd', 'amount', 'currency', 'costType', 'supplierName']);
    sheet.addRow(['2024-01-01', '2024-01-31', 1234.56, 'EUR', 'electricity', 'Test Supplier']);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
    downloadFileMock.mockResolvedValueOnce(buffer);

    const user = await prisma.user.create({
      data: {
        email: 'excel-extraction@test.com',
        passwordHash: 'placeholder',
        firstName: 'Excel',
        lastName: 'User',
        role: 'admin',
      },
    });

    const document = await prisma.document.create({
      data: {
        filename: 'test.xlsx',
        originalFilename: 'test.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: buffer.length,
        fileHash: 'excel-extraction-hash',
        storagePath: 'documents/test.xlsx',
        extractionStatus: 'pending',
        verificationStatus: 'pending',
        uploadedBy: user.id,
      },
    });

    await runExtractionJob({
      documentId: document.id,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
    });

    const updated = await prisma.document.findUnique({ where: { id: document.id } });
    expect(updated?.extractionStatus).toBe('manual');
    expect(updated?.extractionAudit).toMatchObject({
      method: 'csv_primary',
      reason: 'CSV is the primary ingest format. Convert XLS/XLSX to CSV and re-upload.',
      originalMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const costRecords = await prisma.costRecord.findMany({
      where: { sourceDocumentId: document.id },
    });
    expect(costRecords).toHaveLength(0);
  }, 30000);

  it('routes PDF documents to manual when ANTHROPIC_API_KEY is missing', async () => {
    const buffer = Buffer.from('%PDF-1.4 dummy content', 'utf8');
    downloadFileMock.mockResolvedValueOnce(buffer);
    delete process.env.ANTHROPIC_API_KEY;

    const user = await prisma.user.create({
      data: {
        email: 'pdf-manual@test.com',
        passwordHash: 'placeholder',
        firstName: 'PDF',
        lastName: 'User',
        role: 'admin',
      },
    });

    const document = await prisma.document.create({
      data: {
        filename: 'test.pdf',
        originalFilename: 'test.pdf',
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        fileHash: 'pdf-extraction-hash',
        storagePath: 'documents/test.pdf',
        extractionStatus: 'pending',
        verificationStatus: 'pending',
        uploadedBy: user.id,
      },
    });

    await runExtractionJob({
      documentId: document.id,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
    });

    const updated = await prisma.document.findUnique({ where: { id: document.id } });
    expect(updated?.extractionStatus).toBe('manual');
    expect(updated?.extractionAudit).toMatchObject({
      method: 'pdf_llm',
      reason:
        'Automatic PDF extraction requires ANTHROPIC_API_KEY. Upload CSV or configure the key.',
    });
    expect(extractFromPdfMock).not.toHaveBeenCalled();

    const costRecords = await prisma.costRecord.findMany({
      where: { sourceDocumentId: document.id },
    });
    expect(costRecords).toHaveLength(0);
  }, 30000);

  it('routes PDF documents to manual when LLM extraction returns no records', async () => {
    const buffer = Buffer.from('%PDF-1.4 dummy content', 'utf8');
    downloadFileMock.mockResolvedValueOnce(buffer);
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    extractFromPdfMock.mockResolvedValueOnce({
      success: false,
      records: [],
      metadata: {
        sourceType: 'pdf',
        extractionTimestamp: new Date(),
        confidence: 0.2,
        warnings: ['No parsable invoice fields'],
      },
      audit: {
        connectorId: 'pdf_llm',
        connectorVersion: '0.1.0',
        inputHash: 'test-hash',
        llmModel: 'claude-sonnet-4-20250514',
        llmPromptVersion: '1.0.0',
      },
      error: 'No valid records extracted',
    });

    const user = await prisma.user.create({
      data: {
        email: 'pdf-manual-no-records@test.com',
        passwordHash: 'placeholder',
        firstName: 'PDF',
        lastName: 'NoRecords',
        role: 'admin',
      },
    });

    const document = await prisma.document.create({
      data: {
        filename: 'no-records.pdf',
        originalFilename: 'no-records.pdf',
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        fileHash: 'pdf-manual-no-records-hash',
        storagePath: 'documents/no-records.pdf',
        extractionStatus: 'pending',
        verificationStatus: 'pending',
        uploadedBy: user.id,
      },
    });

    await runExtractionJob({
      documentId: document.id,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
    });

    const updated = await prisma.document.findUnique({ where: { id: document.id } });
    expect(updated?.extractionStatus).toBe('manual');
    expect(updated?.extractionAudit).toMatchObject({
      method: 'pdf_llm',
      reason: 'No valid records extracted',
      llmModel: 'claude-sonnet-4-20250514',
    });
    expect(extractFromPdfMock).toHaveBeenCalledTimes(1);

    const costRecords = await prisma.costRecord.findMany({
      where: { sourceDocumentId: document.id },
    });
    expect(costRecords).toHaveLength(0);
  }, 30000);

  it('extracts PDF documents when LLM confidence is above threshold', async () => {
    const buffer = Buffer.from('%PDF-1.4 dummy content', 'utf8');
    downloadFileMock.mockResolvedValueOnce(buffer);
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    extractFromPdfMock.mockResolvedValueOnce({
      success: true,
      records: [
        {
          externalId: 'INV-2024-001',
          periodStart: new Date('2024-01-01'),
          periodEnd: new Date('2024-01-31'),
          amount: 1889.45,
          amountNet: 1587.77,
          vatAmount: 301.68,
          vatRate: 19,
          currency: 'EUR',
          costType: 'electricity',
          supplier: { name: 'LLM Utility GmbH' },
          confidence: 0.86,
          manuallyVerified: false,
          extractionMethod: 'llm',
        },
      ],
      metadata: {
        sourceType: 'pdf',
        extractionTimestamp: new Date(),
        confidence: 0.86,
        warnings: [],
      },
      audit: {
        connectorId: 'pdf_llm',
        connectorVersion: '0.1.0',
        inputHash: 'test-hash-success',
        llmModel: 'claude-sonnet-4-20250514',
        llmPromptVersion: '1.0.0',
      },
    });

    const user = await prisma.user.create({
      data: {
        email: 'pdf-success@test.com',
        passwordHash: 'placeholder',
        firstName: 'PDF',
        lastName: 'Success',
        role: 'admin',
      },
    });

    const document = await prisma.document.create({
      data: {
        filename: 'success.pdf',
        originalFilename: 'success.pdf',
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        fileHash: 'pdf-success-hash',
        storagePath: 'documents/success.pdf',
        extractionStatus: 'pending',
        verificationStatus: 'pending',
        uploadedBy: user.id,
      },
    });

    await runExtractionJob({
      documentId: document.id,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
    });

    const updated = await prisma.document.findUnique({ where: { id: document.id } });
    expect(updated?.extractionStatus).toBe('completed');
    expect(updated?.extractionAudit).toMatchObject({
      method: 'pdf_llm',
      confidence: 0.86,
      llmModel: 'claude-sonnet-4-20250514',
    });
    expect(extractFromPdfMock).toHaveBeenCalledTimes(1);

    const costRecords = await prisma.costRecord.findMany({
      where: { sourceDocumentId: document.id },
    });
    expect(costRecords).toHaveLength(1);
    expect(costRecords[0]?.extractionMethod).toBe('llm');
    expect(Number(costRecords[0]?.amount ?? 0)).toBeCloseTo(1889.45, 2);
  }, 30000);

  it('routes PDF documents to manual when LLM warnings indicate ambiguity', async () => {
    const buffer = Buffer.from('%PDF-1.4 dummy content', 'utf8');
    downloadFileMock.mockResolvedValueOnce(buffer);
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    extractFromPdfMock.mockResolvedValueOnce({
      success: true,
      records: [
        {
          externalId: 'INV-2024-AMB',
          periodStart: new Date('2024-02-01'),
          periodEnd: new Date('2024-02-29'),
          amount: 1200,
          currency: 'EUR',
          costType: 'electricity',
          supplier: { name: 'Ambiguous Utility GmbH' },
          confidence: 0.84,
          manuallyVerified: false,
          extractionMethod: 'llm',
        },
      ],
      metadata: {
        sourceType: 'pdf',
        extractionTimestamp: new Date(),
        confidence: 0.84,
        warnings: ['Net + VAT does not equal gross amount'],
      },
      audit: {
        connectorId: 'pdf_llm',
        connectorVersion: '0.1.0',
        inputHash: 'test-hash-ambiguous',
        llmModel: 'claude-sonnet-4-20250514',
        llmPromptVersion: '1.0.0',
      },
    });

    const user = await prisma.user.create({
      data: {
        email: 'pdf-ambiguous@test.com',
        passwordHash: 'placeholder',
        firstName: 'PDF',
        lastName: 'Ambiguous',
        role: 'admin',
      },
    });

    const document = await prisma.document.create({
      data: {
        filename: 'ambiguous.pdf',
        originalFilename: 'ambiguous.pdf',
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        fileHash: 'pdf-ambiguous-hash',
        storagePath: 'documents/ambiguous.pdf',
        extractionStatus: 'pending',
        verificationStatus: 'pending',
        uploadedBy: user.id,
      },
    });

    await runExtractionJob({
      documentId: document.id,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
    });

    const updated = await prisma.document.findUnique({ where: { id: document.id } });
    expect(updated?.extractionStatus).toBe('manual');
    expect(updated?.extractionAudit).toMatchObject({
      method: 'pdf_llm',
      reason: 'PDF extraction flagged ambiguous or invalid fields. Manual review required.',
    });

    const costRecords = await prisma.costRecord.findMany({
      where: { sourceDocumentId: document.id },
    });
    expect(costRecords).toHaveLength(0);
  }, 30000);
});
