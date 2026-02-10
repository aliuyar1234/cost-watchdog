import { prisma } from '../../lib/db.js';
import { canAccessDocument } from '../../lib/document-access.js';
import { getPresignedDownloadUrl } from '../../lib/s3.js';
import {
  createDocumentNotFoundError,
  createServiceError,
  logDocumentAudit,
  withContext,
} from './helpers.js';
import type { DownloadResult, LoggerLike, ServiceContext } from './types.js';

export async function getDocumentDownloadUrl(
  documentId: string,
  userId: string,
  context: ServiceContext,
  logger?: LoggerLike,
): Promise<DownloadResult> {
  const accessResult = await canAccessDocument(userId, documentId);
  if (!accessResult.allowed) {
    await logDocumentAudit(
      withContext(
        {
          entityType: 'document',
          entityId: documentId,
          action: 'export',
          metadata: { accessDenied: true, reason: accessResult.reason },
          performedBy: userId,
        },
        context,
      ),
      logger,
    );

    return createDocumentNotFoundError();
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { storagePath: true, originalFilename: true, mimeType: true },
  });
  if (!document) {
    return createDocumentNotFoundError();
  }

  try {
    const downloadUrl = await getPresignedDownloadUrl(document.storagePath, {
      filename: document.originalFilename,
      mimeType: document.mimeType,
    });

    await logDocumentAudit(
      withContext(
        {
          entityType: 'document',
          entityId: documentId,
          action: 'export',
          metadata: { filename: document.originalFilename },
          performedBy: userId,
        },
        context,
      ),
      logger,
    );

    return {
      success: true,
      data: {
        downloadUrl,
        filename: document.originalFilename,
        expiresIn: 3600,
      },
    };
  } catch (error) {
    logger?.error(error, 'Failed to generate presigned URL');
    return createServiceError('Internal Server Error', 'Failed to generate download URL', 500);
  }
}
