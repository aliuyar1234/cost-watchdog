import { prisma } from '../../lib/db.js';
import { canDeleteDocument } from '../../lib/document-access.js';
import { deleteFile } from '../../lib/s3.js';
import {
  createDocumentNotFoundError,
  createServiceError,
  logDocumentAudit,
  withContext,
} from './helpers.js';
import type { DeleteResult, LoggerLike, ServiceContext } from './types.js';

export async function deleteDocument(
  documentId: string,
  userId: string,
  context: ServiceContext,
  logger?: LoggerLike,
): Promise<DeleteResult> {
  const deleteResult = await canDeleteDocument(userId, documentId);
  if (!deleteResult.allowed) {
    await logDocumentAudit(
      withContext(
        {
          entityType: 'document',
          entityId: documentId,
          action: 'delete',
          metadata: { deleteDenied: true, reason: deleteResult.reason },
          performedBy: userId,
        },
        context,
      ),
      logger,
    );

    if (
      deleteResult.reason === 'Document not found' ||
      deleteResult.reason === 'User not found or inactive'
    ) {
      return createDocumentNotFoundError();
    }

    return createServiceError(
      'Forbidden',
      deleteResult.reason || 'You do not have permission to delete this document',
      403,
    );
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      storagePath: true,
      _count: { select: { costRecords: true } },
    },
  });
  if (!document) {
    return createDocumentNotFoundError();
  }

  if (document._count.costRecords > 0) {
    return createServiceError('Conflict', 'Cannot delete document with linked cost records', 409);
  }

  try {
    await deleteFile(document.storagePath);
  } catch (error) {
    logger?.error(error, 'Failed to delete file from S3');
  }

  await prisma.document.delete({ where: { id: documentId } });

  await logDocumentAudit(
    withContext(
      {
        entityType: 'document',
        entityId: documentId,
        action: 'delete',
        before: { storagePath: document.storagePath },
        performedBy: userId,
      },
      context,
    ),
    logger,
  );

  return {
    success: true,
    data: undefined,
  };
}
