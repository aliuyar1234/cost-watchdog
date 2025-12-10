/**
 * Password Policy
 *
 * Enforces strong password requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one number (0-9)
 * - At least one special character (!@#$%^&*...)
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RULES
// ═══════════════════════════════════════════════════════════════════════════

const UPPERCASE_REGEX = /[A-Z]/;
const LOWERCASE_REGEX = /[a-z]/;
const NUMBER_REGEX = /[0-9]/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;

// ═══════════════════════════════════════════════════════════════════════════
// ZOD SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((password) => UPPERCASE_REGEX.test(password), {
    message: 'Password must contain at least one uppercase letter (A-Z)',
  })
  .refine((password) => LOWERCASE_REGEX.test(password), {
    message: 'Password must contain at least one lowercase letter (a-z)',
  })
  .refine((password) => NUMBER_REGEX.test(password), {
    message: 'Password must contain at least one number (0-9)',
  })
  .refine((password) => SPECIAL_CHAR_REGEX.test(password), {
    message: 'Password must contain at least one special character (!@#$%^&*...)',
  });

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a password against the policy.
 * Returns detailed error messages for each failed requirement.
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }

  if (!UPPERCASE_REGEX.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z)');
  }

  if (!LOWERCASE_REGEX.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z)');
  }

  if (!NUMBER_REGEX.test(password)) {
    errors.push('Password must contain at least one number (0-9)');
  }

  if (!SPECIAL_CHAR_REGEX.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get human-readable password requirements for display.
 */
export function getPasswordRequirements(): string[] {
  return [
    `At least ${PASSWORD_MIN_LENGTH} characters`,
    'At least one uppercase letter (A-Z)',
    'At least one lowercase letter (a-z)',
    'At least one number (0-9)',
    'At least one special character (!@#$%^&*...)',
  ];
}
