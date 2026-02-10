import { SUPPORTED_UPLOAD_MIME_TYPES } from '../../lib/ingest-policy.js';

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

export interface LoggerLike {
  error: (err: unknown, msg: string) => void;
}

export type UploadResult = ServiceResult<DocumentDTO> | ServiceError;
export type DownloadResult =
  | ServiceResult<{ downloadUrl: string; filename: string; expiresIn: number }>
  | ServiceError;
export type DeleteResult = ServiceResult<void> | ServiceError;
export type RetryResult = ServiceResult<{ message: string }> | ServiceError;

export const ALLOWED_MIME_TYPES = [...SUPPORTED_UPLOAD_MIME_TYPES];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
