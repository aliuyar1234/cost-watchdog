/**
 * Audit Service - Immutable audit trail for security and compliance
 *
 * All significant system changes are logged to the audit_logs table.
 * Logs are immutable and cannot be modified or deleted through the API.
 */

import { prisma } from './db.js';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'verify'
  | 'acknowledge'
  | 'export'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'token_refresh'
  | 'password_change'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'role_change'
  | 'api_key_create'
  | 'api_key_revoke'
  | 'session_terminate'
  | 'account_lock'
  | 'account_unlock';

export type AuditEntityType =
  | 'user'
  | 'cost_record'
  | 'document'
  | 'anomaly'
  | 'alert'
  | 'supplier'
  | 'location'
  | 'cost_center'
  | 'api_key'
  | 'session'
  | 'system';

export interface AuditLogInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changes?: Record<string, unknown> | null;
  reason?: string;
  metadata?: Record<string, unknown>;
  performedBy: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string | null;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  changes: unknown;
  reason: string | null;
  metadata: unknown;
  performedBy: string;
  performedAt: Date;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS FOR QUERY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export const auditLogQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().optional(),
  performedBy: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log an audit event to the database.
 *
 * This function should be called for all significant system changes:
 * - Authentication events (login, logout, token refresh)
 * - CRUD operations on entities
 * - Administrative actions (role changes, API key management)
 * - Security events (account lockout, session termination)
 *
 * @param input - Audit log entry data
 * @returns The created audit log entry
 */
export async function logAuditEvent(input: AuditLogInput): Promise<AuditLogEntry> {
  const entry = await prisma.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: input.before ? JSON.parse(JSON.stringify(input.before)) : undefined,
      after: input.after ? JSON.parse(JSON.stringify(input.after)) : undefined,
      changes: input.changes ? JSON.parse(JSON.stringify(input.changes)) : undefined,
      reason: input.reason,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
      performedBy: input.performedBy,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  return entry as AuditLogEntry;
}

/**
 * Query audit logs with filtering and pagination.
 *
 * @param query - Query parameters
 * @returns Paginated list of audit log entries
 */
export async function queryAuditLogs(query: AuditLogQuery): Promise<{
  data: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}> {
  const where: Record<string, unknown> = {};

  if (query.entityType) {
    where['entityType'] = query.entityType;
  }
  if (query.entityId) {
    where['entityId'] = query.entityId;
  }
  if (query.action) {
    where['action'] = query.action;
  }
  if (query.performedBy) {
    where['performedBy'] = query.performedBy;
  }
  if (query.startDate || query.endDate) {
    where['performedAt'] = {
      ...(query.startDate && { gte: new Date(query.startDate) }),
      ...(query.endDate && { lte: new Date(query.endDate) }),
    };
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { performedAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: data as AuditLogEntry[],
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

/**
 * Get a single audit log entry by ID.
 *
 * @param id - Audit log entry ID
 * @returns The audit log entry or null if not found
 */
export async function getAuditLogById(id: string): Promise<AuditLogEntry | null> {
  const entry = await prisma.auditLog.findUnique({
    where: { id },
  });

  return entry as AuditLogEntry | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate changes between two objects.
 * Returns only the fields that have changed.
 */
export function calculateChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before || !after) return null;

  const changes: Record<string, { from: unknown; to: unknown }> = {};

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const fromValue = before[key];
    const toValue = after[key];

    if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
      changes[key] = { from: fromValue, to: toValue };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Sanitize sensitive fields from audit log data.
 * Removes or masks fields that should not be stored in logs.
 */
export function sanitizeForAudit(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'passwordHash', 'token', 'refreshToken', 'apiKey', 'secret'];
  const result = { ...data };

  for (const field of sensitiveFields) {
    if (field in result) {
      result[field] = '[REDACTED]';
    }
  }

  return result;
}
