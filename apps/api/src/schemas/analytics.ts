/**
 * Analytics Schemas
 *
 * Zod validation schemas for analytics routes.
 */

import { z } from 'zod';
import { dateSchema, uuidSchema } from './common.js';

// ═══════════════════════════════════════════════════════════════════════════
// TIME GRANULARITY
// ═══════════════════════════════════════════════════════════════════════════

export const timeGranularitySchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);
export type TimeGranularity = z.infer<typeof timeGranularitySchema>;

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATION TYPE
// ═══════════════════════════════════════════════════════════════════════════

export const aggregationTypeSchema = z.enum(['sum', 'avg', 'min', 'max', 'count']);
export type AggregationType = z.infer<typeof aggregationTypeSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// COMPARISON TYPE
// ═══════════════════════════════════════════════════════════════════════════

export const comparisonTypeSchema = z.enum([
  'previous_period',
  'same_period_last_year',
  'budget',
  'baseline',
]);
export type ComparisonType = z.infer<typeof comparisonTypeSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// COST TREND ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export const costTrendSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  granularity: timeGranularitySchema.default('month'),
  locationIds: z.array(uuidSchema).optional(),
  costCenterIds: z.array(uuidSchema).optional(),
  supplierIds: z.array(uuidSchema).optional(),
  costTypes: z.array(z.string()).optional(),
  groupBy: z.enum(['location', 'supplier', 'costType', 'costCenter', 'none']).default('none'),
  comparison: comparisonTypeSchema.optional(),
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'startDate must be before or equal to endDate' }
);

export type CostTrendInput = z.infer<typeof costTrendSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// COST BREAKDOWN
// ═══════════════════════════════════════════════════════════════════════════

export const costBreakdownSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  groupBy: z.enum(['location', 'supplier', 'costType', 'costCenter']),
  locationIds: z.array(uuidSchema).optional(),
  costCenterIds: z.array(uuidSchema).optional(),
  supplierIds: z.array(uuidSchema).optional(),
  costTypes: z.array(z.string()).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'startDate must be before or equal to endDate' }
);

export type CostBreakdownInput = z.infer<typeof costBreakdownSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET VS ACTUAL
// ═══════════════════════════════════════════════════════════════════════════

export const budgetComparisonSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  locationIds: z.array(uuidSchema).optional(),
  costCenterIds: z.array(uuidSchema).optional(),
  costTypes: z.array(z.string()).optional(),
});

export type BudgetComparisonInput = z.infer<typeof budgetComparisonSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

export const anomalySummarySchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  locationIds: z.array(uuidSchema).optional(),
  groupBy: z.enum(['severity', 'type', 'status', 'location', 'supplier']).default('severity'),
});

export type AnomalySummaryInput = z.infer<typeof anomalySummarySchema>;

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export const supplierAnalysisSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  supplierIds: z.array(uuidSchema).optional(),
  locationIds: z.array(uuidSchema).optional(),
  costTypes: z.array(z.string()).optional(),
  metrics: z.array(z.enum([
    'total_spend',
    'invoice_count',
    'avg_invoice_value',
    'payment_terms',
    'anomaly_rate',
  ])).default(['total_spend', 'invoice_count']),
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'startDate must be before or equal to endDate' }
);

export type SupplierAnalysisInput = z.infer<typeof supplierAnalysisSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// LOCATION COMPARISON
// ═══════════════════════════════════════════════════════════════════════════

export const locationComparisonSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  locationIds: z.array(uuidSchema).min(2, 'At least 2 locations required for comparison'),
  costTypes: z.array(z.string()).optional(),
  metric: z.enum(['total', 'per_sqm', 'per_employee', 'per_unit']).default('total'),
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'startDate must be before or equal to endDate' }
);

export type LocationComparisonInput = z.infer<typeof locationComparisonSchema>;
