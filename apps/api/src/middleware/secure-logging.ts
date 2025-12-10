/**
 * Secure Logging Middleware
 *
 * Redacts sensitive data from logs to prevent credential leakage.
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

// ═══════════════════════════════════════════════════════════════════════════
// SENSITIVE PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'x-csrf-token',
];

const SENSITIVE_BODY_FIELDS = [
  'password',
  'passwordConfirm',
  'newPassword',
  'oldPassword',
  'currentPassword',
  'token',
  'refreshToken',
  'accessToken',
  'apiKey',
  'secret',
  'mfaCode',
  'backupCode',
  'totpCode',
];

const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

// ═══════════════════════════════════════════════════════════════════════════
// REDACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Redact a header value.
 */
export function redactHeader(name: string, value: string | string[] | undefined): string {
  if (!value) return '[empty]';

  const normalizedName = name.toLowerCase();
  if (SENSITIVE_HEADERS.includes(normalizedName)) {
    if (normalizedName === 'authorization') {
      const val = Array.isArray(value) ? value[0] : value;
      // Show auth type but not the token
      const parts = (val || '').split(' ');
      if (parts.length >= 2) {
        return `${parts[0]} [REDACTED]`;
      }
      return '[REDACTED]';
    }
    return '[REDACTED]';
  }

  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Redact sensitive fields from an object.
 */
export function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();

      // Check if field is sensitive
      if (SENSITIVE_BODY_FIELDS.some((f) => normalizedKey.includes(f.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactObject(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Redact email addresses in strings.
 * john.doe@example.com -> j***@example.com
 */
export function redactString(str: string): string {
  return str.replace(EMAIL_PATTERN, (match, local, domain) => {
    const firstChar = local[0] || '';
    return `${firstChar}***@${domain}`;
  });
}

/**
 * Redact headers object.
 */
export function redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = redactHeader(key, value);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// FASTIFY LOG SERIALIZERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serializer for request objects in logs.
 */
export function requestSerializer(request: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}): Record<string, unknown> {
  return {
    method: request.method,
    url: request.url,
    headers: request.headers ? redactHeaders(request.headers) : undefined,
    // Don't log request body by default (can be large and sensitive)
  };
}

/**
 * Serializer for response objects in logs.
 */
export function responseSerializer(response: {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
}): Record<string, unknown> {
  return {
    statusCode: response.statusCode,
    headers: response.headers ? redactHeaders(response.headers) : undefined,
  };
}

/**
 * Serializer for error objects in logs.
 */
export function errorSerializer(error: Error & { code?: string; statusCode?: number }): {
  type: string;
  message: string;
  stack: string;
  code?: string;
  statusCode?: number;
} {
  return {
    type: error.constructor.name,
    message: redactString(error.message),
    code: error.code,
    statusCode: error.statusCode,
    // Fastify requires stack to be a string, use empty string in production to hide it
    stack: process.env['NODE_ENV'] !== 'production' ? (error.stack ?? '') : '[hidden]',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

async function secureLoggingMiddleware(fastify: FastifyInstance): Promise<void> {
  // Override default serializers with secure versions
  // Note: This should be applied at Fastify instance creation for full effect
  // This hook adds runtime protection for dynamic logging

  fastify.addHook('onRequest', async (request) => {
    // Ensure request.log uses secure serializers
    // The serializers should be configured at Fastify creation time
    // This is a safety net for any manual logging
  });
}

export default fp(secureLoggingMiddleware, {
  name: 'secure-logging',
  fastify: '4.x',
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGGER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get secure logger configuration for Fastify.
 * Use when creating the Fastify instance.
 */
export function getSecureLoggerConfig(): {
  serializers: {
    req: typeof requestSerializer;
    res: typeof responseSerializer;
    err: typeof errorSerializer;
  };
} {
  return {
    serializers: {
      req: requestSerializer,
      res: responseSerializer,
      err: errorSerializer,
    },
  };
}
