import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Docker Secrets Reader
 *
 * Reads secrets from Docker secrets mount path (/run/secrets/) first,
 * falling back to environment variables for development/non-Docker deployments.
 *
 * This approach:
 * - Keeps secrets out of environment variables in production
 * - Secrets not visible via `docker inspect` or /proc
 * - Supports easy secret rotation via Docker Swarm/K8s
 * - Falls back gracefully for local development
 */

const SECRETS_PATH = '/run/secrets';

/**
 * Read a secret value, preferring Docker secrets over env vars.
 *
 * @param name - Secret name (file name in /run/secrets/ or env var name)
 * @param envVarName - Optional different env var name (defaults to uppercase of name)
 * @returns Secret value or undefined if not found
 */
export function readSecret(name: string, envVarName?: string): string | undefined {
  // First, try Docker secrets path
  const secretPath = join(SECRETS_PATH, name);

  if (existsSync(secretPath)) {
    try {
      const value = readFileSync(secretPath, 'utf8').trim();
      if (value) {
        return value;
      }
    } catch (error) {
      console.error(`[Secrets] Failed to read secret from ${secretPath}:`, error);
    }
  }

  // Fall back to environment variable
  const envName = envVarName || name.toUpperCase().replace(/-/g, '_');
  return process.env[envName];
}

/**
 * Read a required secret, throwing if not found.
 *
 * @param name - Secret name
 * @param envVarName - Optional different env var name
 * @returns Secret value
 * @throws Error if secret is not found
 */
export function readRequiredSecret(name: string, envVarName?: string): string {
  const value = readSecret(name, envVarName);

  if (!value) {
    const envName = envVarName || name.toUpperCase().replace(/-/g, '_');
    throw new Error(
      `FATAL: Secret '${name}' not found. ` +
      `Provide via Docker secret at ${join(SECRETS_PATH, name)} ` +
      `or environment variable ${envName}.`
    );
  }

  return value;
}

/**
 * Check if running with Docker secrets available.
 */
export function hasDockerSecrets(): boolean {
  return existsSync(SECRETS_PATH);
}

/**
 * Pre-defined secret readers for common secrets.
 * These use the Docker secret naming convention from docker-compose.swarm.yml
 */
export const secrets = {
  /**
   * Database connection URL.
   * Docker secret: db_url
   * Env var: DATABASE_URL
   */
  getDatabaseUrl(): string | undefined {
    return readSecret('db_url', 'DATABASE_URL');
  },

  getRequiredDatabaseUrl(): string {
    return readRequiredSecret('db_url', 'DATABASE_URL');
  },

  /**
   * Redis connection URL.
   * Docker secret: redis_url
   * Env var: REDIS_URL
   */
  getRedisUrl(): string | undefined {
    return readSecret('redis_url', 'REDIS_URL');
  },

  getRequiredRedisUrl(): string {
    return readRequiredSecret('redis_url', 'REDIS_URL');
  },

  /**
   * Authentication secret for JWT signing.
   * Docker secret: auth_secret
   * Env var: AUTH_SECRET
   */
  getAuthSecret(): string | undefined {
    return readSecret('auth_secret', 'AUTH_SECRET');
  },

  getRequiredAuthSecret(): string {
    return readRequiredSecret('auth_secret', 'AUTH_SECRET');
  },

  /**
   * S3/MinIO access key.
   * Docker secret: s3_access_key
   * Env var: S3_ACCESS_KEY
   */
  getS3AccessKey(): string | undefined {
    return readSecret('s3_access_key', 'S3_ACCESS_KEY');
  },

  getRequiredS3AccessKey(): string {
    return readRequiredSecret('s3_access_key', 'S3_ACCESS_KEY');
  },

  /**
   * S3/MinIO secret key.
   * Docker secret: s3_secret_key
   * Env var: S3_SECRET_KEY
   */
  getS3SecretKey(): string | undefined {
    return readSecret('s3_secret_key', 'S3_SECRET_KEY');
  },

  getRequiredS3SecretKey(): string {
    return readRequiredSecret('s3_secret_key', 'S3_SECRET_KEY');
  },

  /**
   * Resend API key (email delivery).
   * Docker secret: resend_api_key
   * Env var: RESEND_API_KEY
   */
  getResendApiKey(): string | undefined {
    return readSecret('resend_api_key', 'RESEND_API_KEY');
  },

  /**
   * Anthropic API key (LLM extraction fallback).
   * Docker secret: anthropic_api_key
   * Env var: ANTHROPIC_API_KEY
   */
  getAnthropicApiKey(): string | undefined {
    return readSecret('anthropic_api_key', 'ANTHROPIC_API_KEY');
  },

  /**
   * Field encryption key (AES-256).
   * Docker secret: field_encryption_key
   * Env var: FIELD_ENCRYPTION_KEY
   */
  getFieldEncryptionKey(): string | undefined {
    return readSecret('field_encryption_key', 'FIELD_ENCRYPTION_KEY');
  },

  getRequiredFieldEncryptionKey(): string {
    return readRequiredSecret('field_encryption_key', 'FIELD_ENCRYPTION_KEY');
  },
};
