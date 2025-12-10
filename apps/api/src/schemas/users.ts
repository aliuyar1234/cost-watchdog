/**
 * User Schemas
 *
 * Zod validation schemas for user management routes.
 */

import { z } from 'zod';
import { emailSchema, paginationSchema, uuidSchema, sanitizedString, userRoleSchema } from './common.js';

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((password) => /[A-Z]/.test(password), {
    message: 'Password must contain at least one uppercase letter (A-Z)',
  })
  .refine((password) => /[a-z]/.test(password), {
    message: 'Password must contain at least one lowercase letter (a-z)',
  })
  .refine((password) => /[0-9]/.test(password), {
    message: 'Password must contain at least one number (0-9)',
  })
  .refine((password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password), {
    message: 'Password must contain at least one special character (!@#$%^&*...)',
  });

// ═══════════════════════════════════════════════════════════════════════════
// LIST USERS
// ═══════════════════════════════════════════════════════════════════════════

export const listUsersSchema = paginationSchema.extend({
  role: userRoleSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  search: sanitizedString(0, 100).optional(),
  sortBy: z.enum(['email', 'firstName', 'lastName', 'createdAt', 'lastLoginAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// GET USER
// ═══════════════════════════════════════════════════════════════════════════

export const getUserParamsSchema = z.object({
  id: uuidSchema,
});

export type GetUserParams = z.infer<typeof getUserParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// CREATE USER
// ═══════════════════════════════════════════════════════════════════════════

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: sanitizedString(1, 100),
  lastName: sanitizedString(1, 100),
  role: userRoleSchema.default('viewer'),
  permissions: z.array(z.string()).optional(),
  allowedLocationIds: z.array(uuidSchema).optional(),
  allowedCostCenterIds: z.array(uuidSchema).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE USER
// ═══════════════════════════════════════════════════════════════════════════

export const updateUserSchema = z.object({
  firstName: sanitizedString(1, 100).optional(),
  lastName: sanitizedString(1, 100).optional(),
  role: userRoleSchema.optional(),
  permissions: z.array(z.string()).optional(),
  allowedLocationIds: z.array(uuidSchema).optional(),
  allowedCostCenterIds: z.array(uuidSchema).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  { message: 'Passwords do not match', path: ['confirmPassword'] }
).refine(
  (data) => data.currentPassword !== data.newPassword,
  { message: 'New password must be different from current password', path: ['newPassword'] }
);

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// RESET PASSWORD (Admin)
// ═══════════════════════════════════════════════════════════════════════════

export const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
  sendEmail: z.boolean().default(true),
  forcePasswordChange: z.boolean().default(true),
});

export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE PROFILE (Self)
// ═══════════════════════════════════════════════════════════════════════════

export const updateProfileSchema = z.object({
  firstName: sanitizedString(1, 100).optional(),
  lastName: sanitizedString(1, 100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
