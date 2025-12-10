/**
 * Document Service
 *
 * Business logic for document operations.
 * Extracted from routes/documents.ts for better testability and reuse.
 */

import { prisma } from '../lib/db.js';
import {
  uploadFile,
  deleteFile,
  generateStoragePath,
  calculateFileHash,
  getPresignedDownloadUrl,
} from '../lib/s3.js';
import { logAuditEvent } from '../lib/audit.js';
import { canAccessDocument, canDeleteDocument } from '../lib/document-access.js';
import { validateFile, ALLOWED_FILE_TYPES } from '../lib/file-validation.js';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ServiceContext {
  requestId: string;
  ipAddress: string;
  userAgent: string | null;
}

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export interface DocumentDTO {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  extractionStatus: string;
  uploadedAt: string;
}

export interface ServiceResult<T> {
  success: true;
  data: T;
}

export interface ServiceError {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export type UploadResult = ServiceResult<DocumentDTO> | ServiceError;
export type DownloadResult = ServiceResult<{ downloadUrl: string; filename: string; expiresIn: number }> | ServiceError;
export type DeleteResult = ServiceResult<void> | ServiceError;
export type RetryResult = ServiceResult<{ message: string }> | ServiceError;

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_FILE_TYPES);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ----------------------------------------------------------------------------
// DOCUMENT SERVICE CLASS
// ----------------------------------------------------------------------------

export class DocumentService {
  /**
   * Upload a document.
   */
  async upload(
    input: UploadInput,
    userId: string,
    ctx: ServiceContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<UploadResult> {
    const { buffer, filename, mimetype } = input;

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return {
        success: false,
        error: 'Bad Request',
        message: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        statusCode: 400,
      };
    }

    // Validate size
    if (buffer.length > MAX_FILE_SIZE) {
      return {
        success: false,
        error: 'Bad Request',
        message: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        statusCode: 400,
      };
    }

    // Comprehensive file validation
    const validation = await validateFile(buffer, filename, mimetype);
    if (!validation.valid) {
      return {
        success: false,
        error: 'Bad Request',
        message: 'File validation failed',
        statusCode: 400,
        details: validation.errors,
      };
    }

    // Check for duplicate
    const fileHash = calculateFileHash(buffer);
    const existingDoc = await prisma.document.findUnique({
      where: { fileHash },
    });

    if (existingDoc) {
      return {
        success: false,
        error: 'Conflict',
        message: 'Document with identical content already exists',
        statusCode: 409,
        details: { existingDocumentId: existingDoc.id },
      };
    }

    // Generate storage path
    const storagePath = generateStoragePath(validation.sanitizedFilename);

    // Upload to S3
    try {
      await uploadFile(storagePath, buffer, mimetype);
    } catch (error) {
      logger?.error(error, 'Failed to upload file to S3');
      return {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to store document',
        statusCode: 500,
      };
    }

    // Create document in transaction
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
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
          aggregateId: doc.id,
          eventType: 'document.uploaded',
          payload: {
            documentId: doc.id,
            filename: doc.originalFilename,
            mimeType: doc.mimeType,
            storagePath: doc.storagePath,
          },
        },
      });

      return doc;
    });

    // Audit log
    await logAuditEvent({
      entityType: 'document',
      entityId: document.id,
      action: 'create',
      after: {
        filename: document.originalFilename,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
      },
      metadata: { storagePath: document.storagePath, fileHash: document.fileHash },
      performedBy: userId,
      ...ctx,
    }).catch((err) => logger?.error(err, 'Failed to log audit event'));

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

  /**
   * Get download URL for a document.
   */
  async getDownloadUrl(
    documentId: string,
    userId: string,
    ctx: ServiceContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<DownloadResult> {
    // Check access
    const accessResult = await canAccessDocument(userId, documentId);
    if (!accessResult.allowed) {
      await logAuditEvent({
        entityType: 'document',
        entityId: documentId,
        action: 'export',
        metadata: { accessDenied: true, reason: accessResult.reason },
        performedBy: userId,
        ...ctx,
      }).catch((err) => logger?.error(err, 'Failed to log audit event'));

      return {
        success: false,
        error: 'Not Found',
        message: 'Document not found',
        statusCode: 404,
      };
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { storagePath: true, originalFilename: true },
    });

    if (!document) {
      return {
        success: false,
        error: 'Not Found',
        message: 'Document not found',
        statusCode: 404,
      };
    }

    try {
      const downloadUrl = await getPresignedDownloadUrl(document.storagePath);

      await logAuditEvent({
        entityType: 'document',
        entityId: documentId,
        action: 'export',
        metadata: { filename: document.originalFilename },
        performedBy: userId,
        ...ctx,
      }).catch((err) => logger?.error(err, 'Failed to log audit event'));

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
      return {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to generate download URL',
        statusCode: 500,
      };
    }
  }

  /**
   * Delete a document.
   */
  async delete(
    documentId: string,
    userId: string,
    ctx: ServiceContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<DeleteResult> {
    // Check delete permission
    const deleteResult = await canDeleteDocument(userId, documentId);
    if (!deleteResult.allowed) {
      await logAuditEvent({
        entityType: 'document',
        entityId: documentId,
        action: 'delete',
        metadata: { deleteDenied: true, reason: deleteResult.reason },
        performedBy: userId,
        ...ctx,
      }).catch((err) => logger?.error(err, 'Failed to log audit event'));

      if (deleteResult.reason === 'Document not found' || deleteResult.reason === 'User not found or inactive') {
        return {
          success: false,
          error: 'Not Found',
          message: 'Document not found',
          statusCode: 404,
        };
      }

      return {
        success: false,
        error: 'Forbidden',
        message: deleteResult.reason || 'You do not have permission to delete this document',
        statusCode: 403,
      };
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
      return {
        success: false,
        error: 'Not Found',
        message: 'Document not found',
        statusCode: 404,
      };
    }

    if (document._count.costRecords > 0) {
      return {
        success: false,
        error: 'Conflict',
        message: 'Cannot delete document with linked cost records',
        statusCode: 409,
      };
    }

    // Delete from S3
    try {
      await deleteFile(document.storagePath);
    } catch (error) {
      logger?.error(error, 'Failed to delete file from S3');
    }

    // Delete from database
    await prisma.document.delete({ where: { id: documentId } });

    // Audit log
    await logAuditEvent({
      entityType: 'document',
      entityId: documentId,
      action: 'delete',
      before: { storagePath: document.storagePath },
      performedBy: userId,
      ...ctx,
    }).catch((err) => logger?.error(err, 'Failed to log audit event'));

    return { success: true, data: undefined };
  }

  /**
   * Retry extraction for a document.
   */
  async retryExtraction(
    documentId: string,
    userId: string,
    ctx: ServiceContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<RetryResult> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return {
        success: false,
        error: 'Not Found',
        message: 'Document not found',
        statusCode: 404,
      };
    }

    if (!['failed', 'manual'].includes(document.extractionStatus)) {
      return {
        success: false,
        error: 'Bad Request',
        message: 'Can only retry extraction for failed or manual documents',
        statusCode: 400,
      };
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

    // Audit log
    await logAuditEvent({
      entityType: 'document',
      entityId: documentId,
      action: 'update',
      before: { extractionStatus: document.extractionStatus },
      after: { extractionStatus: 'pending' },
      metadata: { operation: 'extraction_retry' },
      performedBy: userId,
      ...ctx,
    }).catch((err) => logger?.error(err, 'Failed to log audit event'));

    return {
      success: true,
      data: { message: 'Extraction retry queued' },
    };
  }

  /**
   * Check document access.
   */
  async checkAccess(
    documentId: string,
    userId: string,
    ctx: ServiceContext,
    logger?: { error: (err: unknown, msg: string) => void }
  ): Promise<{ allowed: boolean; reason?: string }> {
    const result = await canAccessDocument(userId, documentId);

    if (!result.allowed) {
      await logAuditEvent({
        entityType: 'document',
        entityId: documentId,
        action: 'verify',
        metadata: { accessDenied: true, reason: result.reason },
        performedBy: userId,
        ...ctx,
      }).catch((err) => logger?.error(err, 'Failed to log audit event'));
    }

    return result;
  }
}

// Export singleton instance
export const documentService = new DocumentService();
