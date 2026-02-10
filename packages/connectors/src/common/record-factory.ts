import type { ExtractedCostRecord } from '@cost-watchdog/connector-sdk';
import { mapCostType, mapUnit } from './mappings.js';

export interface ParsedCostRow {
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  amountNet?: number;
  vatAmount?: number;
  quantity?: number;
  unit?: string;
  pricePerUnit?: number;
  costType?: string;
  supplierName?: string;
  invoiceNumber?: string;
  location?: string;
  contractNumber?: string;
  meterNumber?: string;
  currency: string;
  rowIndex: number;
}

export function createExtractedCostRecord(
  parsed: ParsedCostRow,
  sourcePrefix: 'csv' | 'excel',
  inputHash: string,
): ExtractedCostRecord {
  return {
    externalId: `${sourcePrefix}-${inputHash.slice(0, 8)}-${parsed.rowIndex}`,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    amount: parsed.amount,
    currency: parsed.currency,
    amountNet: parsed.amountNet,
    vatAmount: parsed.vatAmount,
    quantity: parsed.quantity,
    unit: mapUnit(parsed.unit),
    pricePerUnit: parsed.pricePerUnit,
    costType: mapCostType(parsed.costType),
    sourceDocumentId: undefined,
    sourceLocation: {
      rawText: `Row ${parsed.rowIndex}`,
    },
    supplier: {
      name: parsed.supplierName || 'Unknown Supplier',
    },
    locationId: parsed.location,
    contractNumber: parsed.contractNumber,
    meterNumber: parsed.meterNumber,
    confidence: 0.8,
    manuallyVerified: false,
    extractionMethod: 'template',
  };
}
