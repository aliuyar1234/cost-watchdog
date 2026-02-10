import type { Anomaly, CostRecord, Location, Supplier } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';
import { buildAccessFilter, getUserRestrictions } from '../../lib/access-control.js';
import { TtlCache } from '../../lib/ttl-cache.js';

export const MAX_LIMIT = 100;
export const MAX_RESOLUTION_LENGTH = 2000;
export const VALID_STATUSES = ['new', 'acknowledged', 'resolved', 'false_positive'] as const;

const ANOMALY_STATS_CACHE_TTL_MS = 30 * 1000;
export const ANOMALY_STATS_CACHE_CONTROL = 'private, max-age=30';
export const anomalyStatsCache = new TtlCache<unknown>(ANOMALY_STATS_CACHE_TTL_MS, 200);

export interface AnomalyWithRelations extends Anomaly {
  costRecord:
    | (CostRecord & {
        location: Location | null;
        supplier: Supplier | null;
      })
    | null;
}

export interface AnomalyQuery {
  status?: string;
  severity?: string;
  costRecordId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface AnomalyIdParams {
  id: string;
}

export interface AcknowledgeBody {
  resolution?: string;
}

export interface UpdateStatusBody {
  status: 'new' | 'acknowledged' | 'resolved' | 'false_positive';
  resolution?: string;
}

export interface AnomalyResponse {
  id: string;
  type: string;
  severity: string;
  status: string;
  message: string;
  details: unknown;
  isBackfill: boolean;
  detectedAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolution: string | null;
  costRecord: {
    id: string;
    costType: string;
    amount: number;
    quantity: number | null;
    unit: string | null;
    pricePerUnit: number | null;
    periodStart: string;
    periodEnd: string;
    invoiceNumber: string | null;
    location: {
      id: string;
      name: string;
      type: string;
    } | null;
    supplier: {
      id: string;
      name: string;
      category: string;
    } | null;
  } | null;
}

export const ANOMALY_INCLUDE = {
  costRecord: {
    include: {
      location: true,
      supplier: true,
    },
  },
} as const;

export async function getAnomalyAccessFilter(userId: string): Promise<Record<string, unknown>> {
  const restrictions = await getUserRestrictions(userId);
  return restrictions.hasRestrictions ? { costRecord: buildAccessFilter(restrictions) } : {};
}

function decimalToNumber(value: Decimal | null | undefined): number | null {
  return value ? Number(value) : null;
}

export function formatAnomaly(anomaly: AnomalyWithRelations): AnomalyResponse {
  return {
    id: anomaly.id,
    type: anomaly.type,
    severity: anomaly.severity,
    status: anomaly.status,
    message: anomaly.message,
    details: anomaly.details,
    isBackfill: anomaly.isBackfill,
    detectedAt: anomaly.detectedAt.toISOString(),
    acknowledgedBy: anomaly.acknowledgedBy,
    acknowledgedAt: anomaly.acknowledgedAt?.toISOString() ?? null,
    resolution: anomaly.acknowledgeReason,
    costRecord: anomaly.costRecord
      ? {
          id: anomaly.costRecord.id,
          costType: anomaly.costRecord.costType,
          amount: Number(anomaly.costRecord.amount),
          quantity: decimalToNumber(anomaly.costRecord.quantity),
          unit: anomaly.costRecord.unit,
          pricePerUnit: decimalToNumber(anomaly.costRecord.pricePerUnit),
          periodStart: anomaly.costRecord.periodStart.toISOString(),
          periodEnd: anomaly.costRecord.periodEnd.toISOString(),
          invoiceNumber: anomaly.costRecord.invoiceNumber,
          location: anomaly.costRecord.location
            ? {
                id: anomaly.costRecord.location.id,
                name: anomaly.costRecord.location.name,
                type: anomaly.costRecord.location.type,
              }
            : null,
          supplier: anomaly.costRecord.supplier
            ? {
                id: anomaly.costRecord.supplier.id,
                name: anomaly.costRecord.supplier.name,
                category: anomaly.costRecord.supplier.category,
              }
            : null,
        }
      : null,
  };
}
