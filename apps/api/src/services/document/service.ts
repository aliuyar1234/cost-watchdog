import { checkDocumentAccess } from './access.js';
import { deleteDocument } from './delete.js';
import { getDocumentDownloadUrl } from './download.js';
import { retryDocumentExtraction } from './retry.js';
import { uploadDocument } from './upload.js';
import type {
  DeleteResult,
  DownloadResult,
  LoggerLike,
  RetryResult,
  ServiceContext,
  UploadInput,
  UploadResult,
} from './types.js';

export class DocumentService {
  async upload(
    input: UploadInput,
    userId: string,
    context: ServiceContext,
    logger?: LoggerLike,
  ): Promise<UploadResult> {
    return uploadDocument(input, userId, context, logger);
  }

  async getDownloadUrl(
    documentId: string,
    userId: string,
    context: ServiceContext,
    logger?: LoggerLike,
  ): Promise<DownloadResult> {
    return getDocumentDownloadUrl(documentId, userId, context, logger);
  }

  async delete(
    documentId: string,
    userId: string,
    context: ServiceContext,
    logger?: LoggerLike,
  ): Promise<DeleteResult> {
    return deleteDocument(documentId, userId, context, logger);
  }

  async retryExtraction(
    documentId: string,
    userId: string,
    context: ServiceContext,
    logger?: LoggerLike,
  ): Promise<RetryResult> {
    return retryDocumentExtraction(documentId, userId, context, logger);
  }

  async checkAccess(
    documentId: string,
    userId: string,
    context: ServiceContext,
    logger?: LoggerLike,
  ): Promise<{ allowed: boolean; reason?: string }> {
    return checkDocumentAccess(documentId, userId, context, logger);
  }
}

export const documentService = new DocumentService();
