import { canAccessDocument } from '../../lib/document-access.js';
import { logDocumentAudit, withContext } from './helpers.js';
import type { LoggerLike, ServiceContext } from './types.js';

export async function checkDocumentAccess(
  documentId: string,
  userId: string,
  context: ServiceContext,
  logger?: LoggerLike,
): Promise<{ allowed: boolean; reason?: string }> {
  const result = await canAccessDocument(userId, documentId);

  if (!result.allowed) {
    await logDocumentAudit(
      withContext(
        {
          entityType: 'document',
          entityId: documentId,
          action: 'verify',
          metadata: { accessDenied: true, reason: result.reason },
          performedBy: userId,
        },
        context,
      ),
      logger,
    );
  }

  return result;
}
