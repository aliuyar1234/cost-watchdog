import type { ExtractedCostRecord } from '@cost-watchdog/connector-sdk';
import { mapCostType, mapUnit } from '../../common/mappings.js';
import type { LLMTransformResult } from './types.js';

const INVALID_PERIOD_START_WARNING = 'Invalid periodStart date format';
const INVALID_PERIOD_END_WARNING = 'Invalid periodEnd date format';
const HIGH_AMOUNT_WARNING = 'Amount unusually high (>10M)';
const INVALID_PERIOD_ORDER_WARNING = 'Period end is before period start';
const NET_GROSS_MISMATCH_WARNING = 'Net + VAT does not equal gross amount';

function parseDateField(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function parseNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function hasSupplierName(record: Partial<ExtractedCostRecord>): boolean {
  return typeof record.supplier?.name === 'string' && record.supplier.name.trim().length > 0;
}

export function calculateRecordConfidence(record: Partial<ExtractedCostRecord>): number {
  const requiredChecks = [
    typeof record.amount === 'number',
    record.periodStart instanceof Date,
    record.periodEnd instanceof Date,
    typeof record.costType === 'string',
    hasSupplierName(record),
  ];

  const presentRequired = requiredChecks.filter(Boolean).length;
  const baseConfidence = presentRequired / requiredChecks.length;

  const optionalChecks = [
    typeof record.externalId === 'string',
    typeof record.amountNet === 'number',
    typeof record.quantity === 'number',
    typeof record.meterNumber === 'string',
    typeof record.customerNumber === 'string',
  ];

  const presentOptional = optionalChecks.filter(Boolean).length;
  const optionalBonus = (presentOptional / optionalChecks.length) * 0.2;

  return Math.min(baseConfidence * 0.8 + optionalBonus, 0.9);
}

export function transformLLMOutput(data: Record<string, unknown>): LLMTransformResult {
  const warnings: string[] = [];
  const record: Partial<ExtractedCostRecord> = {
    currency: 'EUR',
  };

  const periodStart = parseDateField(data['periodStart']);
  if (periodStart) {
    record.periodStart = periodStart;
  } else if (typeof data['periodStart'] === 'string') {
    warnings.push(INVALID_PERIOD_START_WARNING);
  }

  const periodEnd = parseDateField(data['periodEnd']);
  if (periodEnd) {
    record.periodEnd = periodEnd;
  } else if (typeof data['periodEnd'] === 'string') {
    warnings.push(INVALID_PERIOD_END_WARNING);
  }

  const invoiceDate = parseDateField(data['invoiceDate']);
  if (invoiceDate) {
    record.invoiceDate = invoiceDate;
  }

  const dueDate = parseDateField(data['dueDate']);
  if (dueDate) {
    record.dueDate = dueDate;
  }

  const amount = parsePositiveNumber(data['amount']);
  if (amount !== undefined) {
    record.amount = amount;
    if (amount > 10000000) {
      warnings.push(HIGH_AMOUNT_WARNING);
    }
  }

  const amountNet = parsePositiveNumber(data['amountNet']);
  if (amountNet !== undefined) {
    record.amountNet = amountNet;
  }

  const vatAmount = parseNonNegativeNumber(data['vatAmount']);
  if (vatAmount !== undefined) {
    record.vatAmount = vatAmount;
  }

  if (typeof data['vatRate'] === 'number' && Number.isFinite(data['vatRate'])) {
    record.vatRate = data['vatRate'];
  }

  const quantity = parsePositiveNumber(data['quantity']);
  if (quantity !== undefined) {
    record.quantity = quantity;
  }

  const pricePerUnit = parsePositiveNumber(data['pricePerUnit']);
  if (pricePerUnit !== undefined) {
    record.pricePerUnit = pricePerUnit;
  }

  if (typeof data['currency'] === 'string' && data['currency'].trim().length > 0) {
    record.currency = data['currency'].trim().toUpperCase();
  }

  if (typeof data['unit'] === 'string') {
    const mappedUnit = mapUnit(data['unit']);
    if (mappedUnit) {
      record.unit = mappedUnit;
    }
  }

  if (typeof data['costType'] === 'string' && data['costType'].trim().length > 0) {
    record.costType = mapCostType(data['costType']);
  }

  if (typeof data['invoiceNumber'] === 'string' && data['invoiceNumber'].trim().length > 0) {
    record.externalId = data['invoiceNumber'].trim();
  }

  if (typeof data['meterNumber'] === 'string' && data['meterNumber'].trim().length > 0) {
    record.meterNumber = data['meterNumber'].trim();
  }

  if (typeof data['contractNumber'] === 'string' && data['contractNumber'].trim().length > 0) {
    record.contractNumber = data['contractNumber'].trim();
  }

  if (typeof data['customerNumber'] === 'string' && data['customerNumber'].trim().length > 0) {
    record.customerNumber = data['customerNumber'].trim();
  }

  if (typeof data['supplierName'] === 'string' && data['supplierName'].trim().length > 0) {
    record.supplier = {
      name: data['supplierName'].trim(),
      taxId:
        typeof data['supplierTaxId'] === 'string' && data['supplierTaxId'].trim().length > 0
          ? data['supplierTaxId'].trim()
          : undefined,
    };
  }

  if (record.periodStart && record.periodEnd && record.periodStart > record.periodEnd) {
    warnings.push(INVALID_PERIOD_ORDER_WARNING);
  }

  if (record.amountNet && record.vatAmount && record.amount) {
    const calculatedGross = record.amountNet + record.vatAmount;
    if (Math.abs(calculatedGross - record.amount) > 1) {
      warnings.push(NET_GROSS_MISMATCH_WARNING);
    }
  }

  return { record, warnings };
}
