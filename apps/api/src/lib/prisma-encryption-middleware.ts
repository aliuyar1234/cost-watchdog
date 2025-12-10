/**
 * Prisma Encryption Middleware
 *
 * Automatically encrypts and decrypts sensitive fields in database operations.
 * Uses AES-256-GCM encryption with key versioning for rotation support.
 */

import { Prisma } from '@prisma/client';
import {
  encrypt,
  decrypt,
  isEncrypted,
  needsReEncryption,
  reEncrypt,
  initializeFromEnv,
} from './field-encryption.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration for encrypted fields.
 * Maps model names to field names that should be encrypted.
 */
export interface EncryptionConfig {
  [modelName: string]: string[];
}

// Fields to encrypt for each model
const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  CostRecord: ['invoiceNumber', 'contractNumber'],
  // Add more models/fields as needed
};

let encryptionConfig: EncryptionConfig = { ...DEFAULT_ENCRYPTION_CONFIG };
let isInitialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the encryption middleware.
 * Must be called before using the middleware.
 */
export function initializeEncryptionMiddleware(config?: EncryptionConfig): void {
  if (config) {
    encryptionConfig = { ...DEFAULT_ENCRYPTION_CONFIG, ...config };
  }

  // Initialize field encryption from environment
  initializeFromEnv();
  isInitialized = true;
}

/**
 * Check if encryption middleware is initialized.
 */
export function isEncryptionInitialized(): boolean {
  return isInitialized;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get encrypted fields for a model.
 */
function getEncryptedFields(modelName: string): string[] {
  return encryptionConfig[modelName] || [];
}

/**
 * Encrypt fields in a data object.
 */
function encryptFields(modelName: string, data: Record<string, unknown>): Record<string, unknown> {
  const encryptedFields = getEncryptedFields(modelName);
  const result = { ...data };

  for (const field of encryptedFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const value = result[field];
      if (typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
        result[field] = encrypt(value);
      }
    }
  }

  return result;
}

/**
 * Decrypt fields in a data object.
 */
function decryptFields(modelName: string, data: Record<string, unknown>): Record<string, unknown> {
  const encryptedFields = getEncryptedFields(modelName);
  const result = { ...data };

  for (const field of encryptedFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const value = result[field];
      if (typeof value === 'string' && isEncrypted(value)) {
        try {
          result[field] = decrypt(value);
        } catch (error) {
          // Log error but don't throw - return encrypted value
          console.error(`Failed to decrypt field ${field}:`, error);
        }
      }
    }
  }

  return result;
}

/**
 * Process a single result record.
 */
function processResult(modelName: string, result: unknown): unknown {
  if (result === null || result === undefined) {
    return result;
  }

  if (Array.isArray(result)) {
    return result.map((item) => processResult(modelName, item));
  }

  if (typeof result === 'object') {
    return decryptFields(modelName, result as Record<string, unknown>);
  }

  return result;
}

/**
 * Process input data for encryption.
 */
function processInput(modelName: string, data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => processInput(modelName, item));
  }

  if (typeof data === 'object') {
    return encryptFields(modelName, data as Record<string, unknown>);
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRISMA MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prisma middleware for automatic field encryption/decryption.
 *
 * @example
 * ```typescript
 * import { PrismaClient } from '@prisma/client';
 * import { encryptionMiddleware, initializeEncryptionMiddleware } from './prisma-encryption-middleware';
 *
 * initializeEncryptionMiddleware();
 * const prisma = new PrismaClient();
 * prisma.$use(encryptionMiddleware);
 * ```
 */
export const encryptionMiddleware: Prisma.Middleware = async (params, next) => {
  if (!isInitialized) {
    // Skip encryption if not initialized
    return next(params);
  }

  const modelName = params.model;
  if (!modelName) {
    return next(params);
  }

  const encryptedFields = getEncryptedFields(modelName);
  if (encryptedFields.length === 0) {
    return next(params);
  }

  // Process input data for write operations
  const writeOperations = ['create', 'createMany', 'update', 'updateMany', 'upsert'];

  if (writeOperations.includes(params.action)) {
    if (params.args.data) {
      params.args.data = processInput(modelName, params.args.data);
    }

    // Handle upsert's create and update data
    if (params.action === 'upsert') {
      if (params.args.create) {
        params.args.create = processInput(modelName, params.args.create);
      }
      if (params.args.update) {
        params.args.update = processInput(modelName, params.args.update);
      }
    }

    // Handle createMany's data array
    if (params.action === 'createMany' && Array.isArray(params.args.data)) {
      params.args.data = params.args.data.map((item: unknown) =>
        processInput(modelName, item)
      );
    }
  }

  // Execute the query
  const result = await next(params);

  // Process output for read operations
  const readOperations = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany'];

  if (readOperations.includes(params.action)) {
    return processResult(modelName, result);
  }

  // Also process result for write operations that return data
  if (writeOperations.includes(params.action) || params.action === 'delete') {
    return processResult(modelName, result);
  }

  return result;
};

// ═══════════════════════════════════════════════════════════════════════════
// KEY ROTATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a record has fields that need re-encryption.
 */
export function recordNeedsReEncryption(
  modelName: string,
  record: Record<string, unknown>
): boolean {
  const encryptedFields = getEncryptedFields(modelName);

  for (const field of encryptedFields) {
    const value = record[field];
    if (typeof value === 'string' && isEncrypted(value) && needsReEncryption(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Re-encrypt fields in a record with the current key.
 */
export function reEncryptRecord(
  modelName: string,
  record: Record<string, unknown>
): Record<string, unknown> {
  const encryptedFields = getEncryptedFields(modelName);
  const result = { ...record };

  for (const field of encryptedFields) {
    const value = result[field];
    if (typeof value === 'string' && isEncrypted(value) && needsReEncryption(value)) {
      result[field] = reEncrypt(value);
    }
  }

  return result;
}

/**
 * Get the list of models with encrypted fields.
 */
export function getModelsWithEncryption(): string[] {
  return Object.keys(encryptionConfig).filter(
    (model) => (encryptionConfig[model]?.length ?? 0) > 0
  );
}

/**
 * Get encryption configuration.
 */
export function getEncryptionConfig(): Readonly<EncryptionConfig> {
  return { ...encryptionConfig };
}
