/**
 * Field Encryption Library
 *
 * Provides AES-256-GCM encryption for sensitive database fields.
 * Supports key versioning for rotation.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { secrets } from './secrets.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_VERSION_LENGTH = 2; // 2 bytes for key version (0-65535)
const ENCODING = 'base64' as const;

// ═══════════════════════════════════════════════════════════════════════════
// KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

interface EncryptionKey {
  version: number;
  key: Buffer;
}

let currentKey: EncryptionKey | null = null;
const keyRing: Map<number, Buffer> = new Map();

/**
 * Initialize the encryption system with the primary key.
 * Key should be 32 bytes (256 bits) for AES-256.
 */
export function initializeEncryption(keyBase64: string, version = 1): void {
  const key = Buffer.from(keyBase64, 'base64');

  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes (256 bits), got ${key.length} bytes`);
  }

  currentKey = { version, key };
  keyRing.set(version, key);
}

/**
 * Add an old key version for decryption (used during key rotation).
 */
export function addLegacyKey(keyBase64: string, version: number): void {
  const key = Buffer.from(keyBase64, 'base64');

  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes (256 bits), got ${key.length} bytes`);
  }

  keyRing.set(version, key);
}

/**
 * Generate a new encryption key.
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('base64');
}

/**
 * Derive a key from a password (for testing or simple deployments).
 */
export function deriveKeyFromPassword(password: string, salt: string): string {
  const key = createHash('sha256')
    .update(password + salt)
    .digest();
  return key.toString('base64');
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION / DECRYPTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encrypt a plaintext value.
 *
 * Output format: base64(version:2 || iv:16 || ciphertext:N || authTag:16)
 */
export function encrypt(plaintext: string): string {
  if (!currentKey) {
    throw new Error('Encryption not initialized. Call initializeEncryption() first.');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, currentKey.key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: version (2 bytes) + iv (16 bytes) + ciphertext + authTag (16 bytes)
  const versionBuffer = Buffer.alloc(KEY_VERSION_LENGTH);
  versionBuffer.writeUInt16BE(currentKey.version, 0);

  const packed = Buffer.concat([versionBuffer, iv, encrypted, authTag]);

  return packed.toString(ENCODING);
}

/**
 * Decrypt an encrypted value.
 *
 * Supports multiple key versions for rotation.
 */
export function decrypt(ciphertext: string): string {
  const packed = Buffer.from(ciphertext, ENCODING);

  if (packed.length < KEY_VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }

  // Unpack: version (2 bytes) + iv (16 bytes) + ciphertext + authTag (16 bytes)
  const version = packed.readUInt16BE(0);
  const iv = packed.subarray(KEY_VERSION_LENGTH, KEY_VERSION_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(
    KEY_VERSION_LENGTH + IV_LENGTH,
    packed.length - AUTH_TAG_LENGTH
  );

  const key = keyRing.get(version);
  if (!key) {
    throw new Error(`Unknown key version: ${version}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check if a value is encrypted (starts with valid format).
 */
export function isEncrypted(value: string): boolean {
  try {
    const packed = Buffer.from(value, ENCODING);
    return packed.length >= KEY_VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Re-encrypt a value with the current key (for key rotation).
 */
export function reEncrypt(ciphertext: string): string {
  const plaintext = decrypt(ciphertext);
  return encrypt(plaintext);
}

/**
 * Get the key version of an encrypted value.
 */
export function getKeyVersion(ciphertext: string): number {
  const packed = Buffer.from(ciphertext, ENCODING);
  if (packed.length < KEY_VERSION_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }
  return packed.readUInt16BE(0);
}

/**
 * Check if a value needs re-encryption (uses old key).
 */
export function needsReEncryption(ciphertext: string): boolean {
  if (!currentKey) return false;
  try {
    return getKeyVersion(ciphertext) !== currentKey.version;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HASH FUNCTIONS (For tokens, backup codes, etc.)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a secure hash of a value (for one-way comparison).
 */
export function secureHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Verify a value against its hash.
 */
export function verifyHash(value: string, hash: string): boolean {
  const computed = secureHash(value);
  // Constant-time comparison
  if (computed.length !== hash.length) return false;

  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION FROM ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize encryption from environment variables.
 *
 * Required: FIELD_ENCRYPTION_KEY (base64-encoded 32-byte key)
 * Optional: FIELD_ENCRYPTION_KEY_VERSION (default: 1)
 * Optional: FIELD_ENCRYPTION_KEY_LEGACY_* for old keys
 */
export function initializeFromEnv(): void {
  const key = secrets.getFieldEncryptionKey();
  const version = parseInt(process.env['FIELD_ENCRYPTION_KEY_VERSION'] || '1', 10);

  if (!key) {
    // In development, generate a deterministic key from AUTH_SECRET
    const authSecret = secrets.getAuthSecret();
    if (authSecret && process.env['NODE_ENV'] !== 'production') {
      const devKey = deriveKeyFromPassword(authSecret, 'field-encryption-dev-salt');
      initializeEncryption(devKey, version);
      return;
    }
    throw new Error('FIELD_ENCRYPTION_KEY environment variable is required');
  }

  initializeEncryption(key, version);

  // Load legacy keys for rotation
  Object.keys(process.env)
    .filter((k) => k.startsWith('FIELD_ENCRYPTION_KEY_LEGACY_'))
    .forEach((envKey) => {
      const legacyVersion = parseInt(envKey.replace('FIELD_ENCRYPTION_KEY_LEGACY_', ''), 10);
      const legacyKey = process.env[envKey];
      if (legacyKey && !isNaN(legacyVersion)) {
        addLegacyKey(legacyKey, legacyVersion);
      }
    });
}
