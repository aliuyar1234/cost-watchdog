import { prisma } from '../../lib/db.js';
import { uploadFile, generateStoragePath, calculateFileHash } from '../../lib/s3.js';
import { validateFile } from '../../lib/file-validation.js';
import {
  canProcessPdfWithLlm,
  isPdfMimeType,
  PDF_LLM_KEY_MISSING_UPLOAD_REASON,
} from '../../lib/ingest-policy.js';
import { createServiceError, logDocumentAudit, withContext } from './helpers.js';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  type LoggerLike,
  type ServiceContext,
  type UploadInput,
  type UploadResult,
} from './types.js';

export async function uploadDocument(
  input: UploadInput,
  userId: string,
  context: ServiceContext,
  logger?: LoggerLike,
): Promise<UploadResult> {
  const { buffer, filename, mimetype } = input;

  if (!ALLOWED_MIME_TYPES.some((allowedType) => allowedType === mimetype)) {
    return createServiceError(
      'Bad Request',
      `Invalid file type. Supported ingest types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      400,
    );
  }

  if (isPdfMimeType(mimetype) && !canProcessPdfWithLlm()) {
    return createServiceError('Unprocessable Entity', PDF_LLM_KEY_MISSING_UPLOAD_REASON, 422);
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return createServiceError(
      'Bad Request',
      `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      400,
    );
  }

  const validation = await validateFile(buffer, filename, mimetype);
  if (!validation.valid) {
    return createServiceError('Bad Request', 'File validation failed', 400, validation.errors);
  }

  const fileHash = calculateFileHash(buffer);
  const existingDocument = await prisma.document.findUnique({
    where: { fileHash },
  });
  if (existingDocument) {
    return createServiceError('Conflict', 'Document with identical content already exists', 409, {
      existingDocumentId: existingDocument.id,
    });
  }

  const storagePath = generateStoragePath(validation.sanitizedFilename);
  try {
    await uploadFile(storagePath, buffer, mimetype);
  } catch (error) {
    logger?.error(error, 'Failed to upload file to S3');
    return createServiceError('Internal Server Error', 'Failed to store document', 500);
  }

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        filename: storagePath.split('/').pop() || filename,
        originalFilename: filename,
        mimeType: mimetype,
        fileSize: buffer.length,
        fileHash,
        storagePath,
        extractionStatus: 'pending',
        verificationStatus: 'pending',
        uploadedBy: userId,
      },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'document',
        aggregateId: created.id,
        eventType: 'document.uploaded',
        payload: {
          documentId: created.id,
          filename: created.originalFilename,
          mimeType: created.mimeType,
          storagePath: created.storagePath,
        },
      },
    });

    return created;
  });

  await logDocumentAudit(
    withContext(
      {
        entityType: 'document',
        entityId: document.id,
        action: 'create',
        after: {
          filename: document.originalFilename,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
        },
        metadata: {
          storagePath: document.storagePath,
          fileHash: document.fileHash,
        },
        performedBy: userId,
      },
      context,
    ),
    logger,
  );

  return {
    success: true,
    data: {
      id: document.id,
      filename: document.filename,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      extractionStatus: document.extractionStatus,
      uploadedAt: document.uploadedAt.toISOString(),
    },
  };
}
