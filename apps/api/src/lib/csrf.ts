/**
 * CSRF Protection Library
 *
 * Implements the double-submit cookie pattern for CSRF protection.
 */

import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_TOKEN_LENGTH = 32;
export const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a new CSRF token.
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Generate a signed CSRF token with timestamp.
 * Format: token.timestamp.signature
 */
export function generateSignedCsrfToken(secret: string): string {
  const token = generateCsrfToken();
  const timestamp = Date.now().toString(36);
  const data = `${token}.${timestamp}`;
  const signature = createHmac('sha256', secret).update(data).digest('hex').slice(0, 16);
  return `${data}.${signature}`;
}

/**
 * Parse and validate a signed CSRF token.
 */
export function parseSignedCsrfToken(
  signedToken: string,
  secret: string
): { valid: boolean; expired: boolean; token?: string } {
  const parts = signedToken.split('.');
  if (parts.length !== 3) {
    return { valid: false, expired: false };
  }

  const [token, timestamp, signature] = parts as [string, string, string];

  // Verify signature
  const data = `${token}.${timestamp}`;
  const expectedSignature = createHmac('sha256', secret).update(data).digest('hex').slice(0, 16);

  try {
    const sigBuffer = Buffer.from(signature || '', 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, expired: false };
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, expired: false };
    }
  } catch {
    return { valid: false, expired: false };
  }

  // Check expiry
  const tokenTime = parseInt(timestamp || '0', 36);
  const now = Date.now();
  if (now - tokenTime > CSRF_TOKEN_EXPIRY_MS) {
    return { valid: true, expired: true, token };
  }

  return { valid: true, expired: false, token };
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate CSRF token using double-submit cookie pattern.
 *
 * The token from the header/body must match the token from the cookie.
 */
export function validateCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined,
  secret: string
): { valid: boolean; reason?: string } {
  if (!cookieToken) {
    return { valid: false, reason: 'Missing CSRF cookie' };
  }

  if (!headerToken) {
    return { valid: false, reason: 'Missing CSRF header' };
  }

  // Parse both tokens
  const cookieParsed = parseSignedCsrfToken(cookieToken, secret);
  const headerParsed = parseSignedCsrfToken(headerToken, secret);

  if (!cookieParsed.valid) {
    return { valid: false, reason: 'Invalid CSRF cookie signature' };
  }

  if (!headerParsed.valid) {
    return { valid: false, reason: 'Invalid CSRF header signature' };
  }

  if (cookieParsed.expired || headerParsed.expired) {
    return { valid: false, reason: 'CSRF token expired' };
  }

  // Compare the token portions (not the full signed token, as timestamps may differ)
  if (cookieParsed.token !== headerParsed.token) {
    return { valid: false, reason: 'CSRF token mismatch' };
  }

  return { valid: true };
}

/**
 * Simple validation (non-signed tokens).
 * For simpler implementations that just compare cookie and header.
 */
export function validateSimpleCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined
): { valid: boolean; reason?: string } {
  if (!cookieToken) {
    return { valid: false, reason: 'Missing CSRF cookie' };
  }

  if (!headerToken) {
    return { valid: false, reason: 'Missing CSRF header' };
  }

  // Constant-time comparison
  try {
    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);

    if (cookieBuffer.length !== headerBuffer.length) {
      return { valid: false, reason: 'CSRF token mismatch' };
    }

    if (!timingSafeEqual(cookieBuffer, headerBuffer)) {
      return { valid: false, reason: 'CSRF token mismatch' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid token format' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a request method requires CSRF protection.
 */
export function requiresCsrfProtection(method: string): boolean {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  return !safeMethods.includes(method.toUpperCase());
}

/**
 * Get CSRF cookie options.
 */
export function getCsrfCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: false, // JavaScript needs to read this for the header
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CSRF_TOKEN_EXPIRY_MS / 1000, // In seconds
  };
}
