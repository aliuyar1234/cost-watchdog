import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';
import type { Readable } from 'stream';

/**
 * S3/MinIO client configuration.
 */
const s3Client = new S3Client({
  endpoint: process.env['S3_ENDPOINT'] || 'http://localhost:9000',
  region: process.env['S3_REGION'] || 'eu-central-1',
  credentials: {
    accessKeyId: process.env['S3_ACCESS_KEY'] || 'minio_admin',
    secretAccessKey: process.env['S3_SECRET_KEY'] || 'minio_admin_dev',
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET = process.env['S3_BUCKET'] || 'cost-watchdog';

/**
 * Generate a unique storage path for a document.
 *
 * @param tenantId - Tenant UUID
 * @param filename - Original filename
 * @returns Storage path in format: tenants/{tenantId}/documents/{year}/{month}/{uuid}-{filename}
 */
export function generateStoragePath(filename: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = randomUUID();
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

  return `documents/${year}/${month}/${uuid}-${safeFilename}`;
}

/**
 * Calculate SHA-256 hash of a buffer.
 *
 * @param buffer - File content buffer
 * @returns Hex-encoded hash string
 */
export function calculateFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Upload a file to S3/MinIO.
 *
 * @param storagePath - The storage path/key for the file
 * @param buffer - File content buffer
 * @param contentType - MIME type of the file
 * @returns Object containing bucket and key
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<{ bucket: string; key: string }> {
  const params: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: storagePath,
    Body: buffer,
    ContentType: contentType,
  };

  await s3Client.send(new PutObjectCommand(params));

  return { bucket: BUCKET, key: storagePath };
}

/**
 * Download a file from S3/MinIO.
 *
 * @param storagePath - The storage path/key for the file
 * @returns File content as buffer
 */
export async function downloadFile(storagePath: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storagePath,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('Empty response body from S3');
  }

  // Convert stream to buffer
  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Delete a file from S3/MinIO.
 *
 * @param storagePath - The storage path/key for the file
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: storagePath,
  });

  await s3Client.send(command);
}

/**
 * Check if a file exists in S3/MinIO.
 *
 * @param storagePath - The storage path/key for the file
 * @returns True if file exists
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: storagePath,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Generate a presigned URL for downloading a file.
 *
 * @param storagePath - The storage path/key for the file
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns Presigned URL
 */
export async function getPresignedDownloadUrl(
  storagePath: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storagePath,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for uploading a file.
 *
 * @param storagePath - The storage path/key for the file
 * @param contentType - Expected MIME type
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 * @returns Presigned URL
 */
export async function getPresignedUploadUrl(
  storagePath: string,
  contentType: string,
  expiresIn: number = 900
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storagePath,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export { s3Client, BUCKET };
