/**
 * Anomaly Schemas
 *
 * Zod validation schemas for anomaly routes.
 */

import { z } from 'zod';
import { dateSchema, paginationSchema, uuidSchema, sortOrderSchema, sanitizedString } from './common.js';

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY SEVERITY
// ═══════════════════════════════════════════════════════════════════════════

export const anomalySeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type AnomalySeverity = z.infer<typeof anomalySeveritySchema>;

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY STATUS
// ═══════════════════════════════════════════════════════════════════════════

export const anomalyStatusSchema = z.enum(['new', 'acknowledged', 'resolved', 'ignored']);
export type AnomalyStatus = z.infer<typeof anomalyStatusSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY TYPE
// ═══════════════════════════════════════════════════════════════════════════

export const anomalyTypeSchema = z.enum([
  'spike',
  'drop',
  'missing_data',
  'duplicate',
  'outlier',
  'seasonal_deviation',
  'trend_break',
  'data_quality',
  'other',
]);
export type AnomalyType = z.infer<typeof anomalyTypeSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// LIST ANOMALIES
// ═══════════════════════════════════════════════════════════════════════════

export const listAnomaliesSchema = paginationSchema.extend({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  severity: anomalySeveritySchema.array().optional(),
  status: anomalyStatusSchema.array().optional(),
  types: anomalyTypeSchema.array().optional(),
  locationIds: z.array(uuidSchema).optional(),
  supplierIds: z.array(uuidSchema).optional(),
  costRecordId: uuidSchema.optional(),
  sortBy: z.enum(['detectedAt', 'severity', 'status']).default('detectedAt'),
  sortOrder: sortOrderSchema,
});

export type ListAnomaliesInput = z.infer<typeof listAnomaliesSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// GET ANOMALY
// ═══════════════════════════════════════════════════════════════════════════

export const getAnomalyParamsSchema = z.object({
  id: uuidSchema,
});

export type GetAnomalyParams = z.infer<typeof getAnomalyParamsSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// ACKNOWLEDGE ANOMALY
// ═══════════════════════════════════════════════════════════════════════════

export const acknowledgeAnomalySchema = z.object({
  reason: sanitizedString(10, 1000),
  notes: sanitizedString(0, 2000).optional(),
});

export type AcknowledgeAnomalyInput = z.infer<typeof acknowledgeAnomalySchema>;

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVE ANOMALY
// ═══════════════════════════════════════════════════════════════════════════

export const resolveAnomalySchema = z.object({
  resolution: sanitizedString(10, 2000),
  preventionMeasures: sanitizedString(0, 2000).optional(),
});

export type ResolveAnomalyInput = z.infer<typeof resolveAnomalySchema>;

// ═══════════════════════════════════════════════════════════════════════════
// IGNORE ANOMALY
// ═══════════════════════════════════════════════════════════════════════════

export const ignoreAnomalySchema = z.object({
  reason: sanitizedString(10, 1000),
  suppressFuture: z.boolean().default(false),
  suppressDuration: z.enum(['1_day', '1_week', '1_month', 'permanent']).optional(),
});

export type IgnoreAnomalyInput = z.infer<typeof ignoreAnomalySchema>;
