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
import { secrets } from './secrets.js';

/**
 * Environment validation for S3/MinIO configuration.
 * Reads from Docker secrets first, falls back to environment variables.
 * In production, all credentials MUST be provided.
 */
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

const S3_ENDPOINT = process.env['S3_ENDPOINT'];
const S3_REGION = process.env['S3_REGION'];
const S3_ACCESS_KEY = secrets.getS3AccessKey();
const S3_SECRET_KEY = secrets.getS3SecretKey();
const S3_BUCKET_ENV = process.env['S3_BUCKET'];

// Validate required credentials in production
if (IS_PRODUCTION) {
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY) {
    throw new Error('FATAL: S3 credentials required in production (via Docker secret or env var)');
  }
  if (!S3_ENDPOINT) {
    throw new Error('FATAL: S3_ENDPOINT is required in production');
  }
  if (!S3_BUCKET_ENV) {
    throw new Error('FATAL: S3_BUCKET is required in production');
  }
}

// In development, require explicit credentials via environment variables
// No hardcoded defaults - developers must configure their own .env file
if (!IS_PRODUCTION && (!S3_ACCESS_KEY || !S3_SECRET_KEY)) {
  console.warn(
    '[S3] WARNING: S3 credentials not set. ' +
    'Please configure them in your .env file for local development.'
  );
}

/**
 * S3/MinIO client configuration.
 * Credentials read from Docker secrets or environment variables.
 */
const s3Client = new S3Client({
  endpoint: S3_ENDPOINT || 'http://localhost:9000',
  region: S3_REGION || 'eu-central-1',
  credentials: {
    // Read from /run/secrets/ first, fall back to env vars
    accessKeyId: S3_ACCESS_KEY || '',
    secretAccessKey: S3_SECRET_KEY || '',
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET = S3_BUCKET_ENV || 'cost-watchdog';

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
