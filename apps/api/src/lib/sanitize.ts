/**
 * Input sanitization utilities for preventing XSS and other injection attacks.
 */

/**
 * Sanitize a string to prevent XSS attacks.
 * Escapes HTML special characters and removes potentially dangerous content.
 *
 * @param input - The string to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Escape HTML special characters
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove other control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize a string while preserving basic formatting (newlines, spaces).
 * Use this for text areas where formatting should be preserved.
 *
 * @param input - The string to sanitize
 * @returns Sanitized string with preserved formatting
 */
export function sanitizeTextArea(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Escape HTML special characters but preserve newlines and tabs
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except \t and \n
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validate and sanitize a URL.
 * Only allows http and https protocols.
 *
 * @param input - The URL to validate
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  try {
    const url = new URL(input.trim());
    // Only allow http and https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Strip all HTML tags from a string.
 *
 * @param input - The string to strip tags from
 * @returns String with all HTML tags removed
 */
export function stripHtmlTags(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize an object by applying sanitization to all string values.
 *
 * @param obj - The object to sanitize
 * @returns Sanitized object
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeString(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = sanitizeObject(value as Record<string, unknown>);
    }
  }

  return result;
}
