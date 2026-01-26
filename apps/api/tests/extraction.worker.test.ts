import { describe, it, expect, vi } from 'vitest';
import { Queue, QueueEvents } from 'bullmq';
import { prisma } from './setup';
import { createRedisConnection } from '../src/lib/redis.js';
import { QUEUE_NAMES } from '../src/lib/queues.js';
import { createExtractionWorker } from '../src/workers/extraction.worker.js';
import { downloadFile } from '../src/lib/s3.js';

vi.mock('../src/lib/s3.js', () => ({
  downloadFile: vi.fn(),
}));

describe('ExtractionWorker', () => {
  const downloadFileMock = vi.mocked(downloadFile);

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

  it('extracts an Excel document and creates cost records', async () => {
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
    expect(updated?.extractionStatus).toBe('completed');

    const costRecords = await prisma.costRecord.findMany({
      where: { sourceDocumentId: document.id },
    });
    expect(costRecords).toHaveLength(1);
  }, 30000);
});
