/**
 * Export Schemas
 *
 * Zod validation schemas for export routes.
 */

import { z } from 'zod';
import { dateSchema, paginationSchema, uuidSchema, sortOrderSchema } from './common.js';

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FORMAT
// ═══════════════════════════════════════════════════════════════════════════

export const exportFormatSchema = z.enum(['csv', 'xlsx', 'pdf', 'json']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT REQUEST
// ═══════════════════════════════════════════════════════════════════════════

export const exportRequestSchema = z.object({
  format: exportFormatSchema.default('csv'),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  locationIds: z.array(uuidSchema).optional(),
  costCenterIds: z.array(uuidSchema).optional(),
  supplierIds: z.array(uuidSchema).optional(),
  costTypes: z.array(z.string()).optional(),
  includeAnomalies: z.boolean().default(false),
  columns: z.array(z.string()).optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'startDate must be before or equal to endDate' }
);

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// COST RECORDS EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const costRecordsExportSchema = z.object({
  format: exportFormatSchema.default('csv'),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  locationIds: z.array(uuidSchema).optional(),
  costCenterIds: z.array(uuidSchema).optional(),
  supplierIds: z.array(uuidSchema).optional(),
  costTypes: z.array(z.string()).optional(),
  includeAnomalies: z.boolean().default(false),
  columns: z.array(z.string()).optional(),
  groupBy: z.enum(['location', 'supplier', 'costType', 'month', 'none']).default('none'),
  aggregation: z.enum(['sum', 'avg', 'count', 'none']).default('none'),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'startDate must be before or equal to endDate' }
);

export type CostRecordsExportInput = z.infer<typeof costRecordsExportSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALIES EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const anomaliesExportSchema = z.object({
  format: exportFormatSchema.default('csv'),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  severity: z.enum(['critical', 'warning', 'info']).array().optional(),
  status: z.enum(['new', 'acknowledged', 'resolved', 'ignored']).array().optional(),
  types: z.array(z.string()).optional(),
});

export type AnomaliesExportInput = z.infer<typeof anomaliesExportSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGS EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const auditLogsExportSchema = z.object({
  format: exportFormatSchema.default('csv'),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  entityTypes: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  performedBy: uuidSchema.optional(),
});

export type AuditLogsExportInput = z.infer<typeof auditLogsExportSchema>;
