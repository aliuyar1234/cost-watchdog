import { prisma } from '../../lib/db.js';
import {
  createDocumentNotFoundError,
  createServiceError,
  logDocumentAudit,
  withContext,
} from './helpers.js';
import type { LoggerLike, RetryResult, ServiceContext } from './types.js';

export async function retryDocumentExtraction(
  documentId: string,
  userId: string,
  context: ServiceContext,
  logger?: LoggerLike,
): Promise<RetryResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });
  if (!document) {
    return createDocumentNotFoundError();
  }

  if (!['failed', 'manual'].includes(document.extractionStatus)) {
    return createServiceError(
      'Bad Request',
      'Can only retry extraction for failed or manual documents',
      400,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: documentId },
      data: { extractionStatus: 'pending' },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'document',
        aggregateId: documentId,
        eventType: 'document.extraction_retry',
        payload: {
          documentId,
          storagePath: document.storagePath,
          mimeType: document.mimeType,
        },
      },
    });
  });

  await logDocumentAudit(
    withContext(
      {
        entityType: 'document',
        entityId: documentId,
        action: 'update',
        before: { extractionStatus: document.extractionStatus },
        after: { extractionStatus: 'pending' },
        metadata: { operation: 'extraction_retry' },
        performedBy: userId,
      },
      context,
    ),
    logger,
  );

  return {
    success: true,
    data: { message: 'Extraction retry queued' },
  };
}
