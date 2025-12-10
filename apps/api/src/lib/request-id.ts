/**
 * Request ID Library
 *
 * Generates and propagates unique request IDs for distributed tracing.
 */

import { randomUUID } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_HEADER_LOWER = 'x-request-id';

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a new unique request ID.
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Validate a request ID format.
 * Accepts UUIDs and other common formats (16-64 chars, alphanumeric + dashes).
 */
export function isValidRequestId(requestId: string): boolean {
  if (!requestId || typeof requestId !== 'string') {
    return false;
  }

  // Allow alphanumeric, dashes, and underscores, 16-64 characters
  const pattern = /^[a-zA-Z0-9_-]{16,64}$/;
  return pattern.test(requestId);
}

/**
 * Extract request ID from headers, or generate a new one.
 * Sanitizes incoming request IDs to prevent injection.
 */
export function extractOrGenerateRequestId(headers: Record<string, string | string[] | undefined>): string {
  const incomingId = headers[REQUEST_ID_HEADER] || headers[REQUEST_ID_HEADER_LOWER];

  if (incomingId) {
    const id = Array.isArray(incomingId) ? incomingId[0] : incomingId;
    if (id && isValidRequestId(id)) {
      return id;
    }
  }

  return generateRequestId();
}

// ═══════════════════════════════════════════════════════════════════════════
// ASYNC LOCAL STORAGE (For accessing request ID in deep call stacks)
// ═══════════════════════════════════════════════════════════════════════════

import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function with a request context.
 */
export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  const context: RequestContext = {
    requestId,
    startTime: Date.now(),
  };
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request ID from context.
 * Returns undefined if not in a request context.
 */
export function getCurrentRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

/**
 * Get the current request context.
 */
export function getCurrentRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get elapsed time since request started.
 */
export function getElapsedMs(): number | undefined {
  const context = asyncLocalStorage.getStore();
  if (!context) return undefined;
  return Date.now() - context.startTime;
}
