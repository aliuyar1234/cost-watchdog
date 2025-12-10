/**
 * Common Zod Schemas
 *
 * Shared validation schemas used across multiple routes.
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UUID validation (v4 format).
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Date string validation (ISO 8601).
 */
export const dateStringSchema = z.string().datetime({ offset: true }).or(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
);

/**
 * Date that accepts various formats and converts to Date object.
 */
export const dateSchema = z.coerce.date();

/**
 * Positive integer.
 */
export const positiveIntSchema = z.number().int().positive();

/**
 * Non-negative integer (0 or greater).
 */
export const nonNegativeIntSchema = z.number().int().min(0);

/**
 * Positive decimal number.
 */
export const positiveDecimalSchema = z.number().positive();

// ═══════════════════════════════════════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════════════════════════════════════

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// DATE RANGE
// ═══════════════════════════════════════════════════════════════════════════

export const dateRangeSchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'startDate must be before or equal to endDate' }
);

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// SORTING
// ═══════════════════════════════════════════════════════════════════════════

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export type SortOrder = z.infer<typeof sortOrderSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// SANITIZATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sanitize a string to prevent XSS.
 * Removes HTML tags and trims whitespace.
 */
export function sanitizeString(val: string): string {
  return val.trim().replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
}

/**
 * Create a sanitized string schema with length constraints.
 */
export function sanitizedString(minLen: number, maxLen: number) {
  return z.string()
    .min(minLen)
    .max(maxLen)
    .transform(sanitizeString);
}

/**
 * Simple sanitized string (no length constraints).
 */
export const sanitizedStringSchema = z.string().transform(sanitizeString);

/**
 * Email validation with normalization.
 */
export const emailSchema = z.string()
  .email('Invalid email format')
  .transform((val) => val.toLowerCase().trim());

/**
 * Safe file path component (no path traversal).
 */
export const safeFilenameSchema = z.string()
  .min(1, 'Filename is required')
  .max(255, 'Filename too long')
  .refine(
    (val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'),
    'Invalid filename: path traversal not allowed'
  );

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════

export const userRoleSchema = z.enum(['admin', 'manager', 'analyst', 'viewer', 'auditor']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const documentTypeSchema = z.enum([
  'invoice',
  'credit_note',
  'statement',
  'receipt',
  'contract',
  'other',
]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const costTypeSchema = z.enum([
  'electricity',
  'gas',
  'water',
  'heating',
  'waste',
  'internet',
  'phone',
  'insurance',
  'rent',
  'maintenance',
  'cleaning',
  'security',
  'other',
]);
export type CostType = z.infer<typeof costTypeSchema>;
