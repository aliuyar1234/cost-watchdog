import { prisma } from '../db.js';
import { DOCUMENT_REVIEW_NOTE } from './constants.js';

export async function flagDocumentsForReview(userId: string): Promise<number> {
  const result = await prisma.document.updateMany({
    where: { uploadedBy: userId },
    data: {
      verificationStatus: 'pending',
      verificationNotes: DOCUMENT_REVIEW_NOTE,
    },
  });

  return result.count;
}
