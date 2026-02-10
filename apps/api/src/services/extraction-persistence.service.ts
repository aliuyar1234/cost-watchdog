import type { Prisma, Supplier } from '@prisma/client';
import type { ExtractedCostRecord } from '@cost-watchdog/connectors';
import { prisma } from '../lib/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function uniqueTrimmedValues(values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
    ),
  ];
}

export interface PersistedCostRecordSummary {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
}

interface PersistExtractedCostRecordsInput {
  documentId: string;
  records: ExtractedCostRecord[];
  isBackfill?: boolean;
}

export async function persistExtractedCostRecords({
  documentId,
  records,
  isBackfill,
}: PersistExtractedCostRecordsInput): Promise<PersistedCostRecordSummary[]> {
  return prisma.$transaction(async (tx) => {
    const locationCache = new Map<string, string | null>();
    const costCenterCache = new Map<string, string | null>();

    const locationValues = uniqueTrimmedValues(records.map((record) => record.locationId));
    const locationUuids = locationValues.filter(isUuid);
    const locationNames = locationValues.filter((value) => !isUuid(value));

    const [locationsById, locationsByName] = await Promise.all([
      locationUuids.length > 0
        ? tx.location.findMany({
            where: { id: { in: locationUuids } },
            select: { id: true },
          })
        : Promise.resolve([]),
      locationNames.length > 0
        ? tx.location.findMany({
            where: {
              OR: [
                { code: { in: locationNames } },
                { externalId: { in: locationNames } },
                { name: { in: locationNames } },
              ],
            },
            select: { id: true, code: true, externalId: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    for (const location of locationsById) {
      locationCache.set(location.id, location.id);
    }

    const locationByCode = new Map<string, string>();
    const locationByExternalId = new Map<string, string>();
    const locationByName = new Map<string, string>();
    for (const location of locationsByName) {
      if (location.code && !locationByCode.has(location.code)) {
        locationByCode.set(location.code, location.id);
      }
      if (location.externalId && !locationByExternalId.has(location.externalId)) {
        locationByExternalId.set(location.externalId, location.id);
      }
      if (!locationByName.has(location.name)) {
        locationByName.set(location.name, location.id);
      }
    }

    for (const locationValue of locationNames) {
      const resolved =
        locationByCode.get(locationValue) ||
        locationByExternalId.get(locationValue) ||
        locationByName.get(locationValue) ||
        null;
      locationCache.set(locationValue, resolved);
    }

    const costCenterValues = uniqueTrimmedValues(records.map((record) => record.costCenterId));
    const costCenterUuids = costCenterValues.filter(isUuid);
    const costCenterCodes = costCenterValues.filter((value) => !isUuid(value));

    const [costCentersById, costCentersByCode] = await Promise.all([
      costCenterUuids.length > 0
        ? tx.costCenter.findMany({
            where: { id: { in: costCenterUuids } },
            select: { id: true },
          })
        : Promise.resolve([]),
      costCenterCodes.length > 0
        ? tx.costCenter.findMany({
            where: { code: { in: costCenterCodes } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
    ]);

    for (const costCenter of costCentersById) {
      costCenterCache.set(costCenter.id, costCenter.id);
    }
    for (const costCenter of costCentersByCode) {
      costCenterCache.set(costCenter.code, costCenter.id);
    }
    for (const costCenterValue of costCenterValues) {
      if (!costCenterCache.has(costCenterValue)) {
        costCenterCache.set(costCenterValue, null);
      }
    }

    const supplierNames = [
      ...new Set(
        records.map((record) => record.supplier.name.trim()).filter((value) => value.length > 0),
      ),
    ];
    const supplierTaxIds = uniqueTrimmedValues(records.map((record) => record.supplier.taxId));

    const supplierWhere: Prisma.SupplierWhereInput[] = [];
    if (supplierTaxIds.length > 0) {
      supplierWhere.push({ taxId: { in: supplierTaxIds } });
    }
    if (supplierNames.length > 0) {
      supplierWhere.push({ name: { in: supplierNames } });
    }

    const existingSuppliers =
      supplierWhere.length > 0
        ? await tx.supplier.findMany({
            where: { OR: supplierWhere },
          })
        : [];

    const suppliersByTaxId = new Map<string, Supplier>();
    const suppliersByName = new Map<string, Supplier>();
    for (const supplier of existingSuppliers) {
      if (supplier.taxId) {
        suppliersByTaxId.set(supplier.taxId.trim().toLowerCase(), supplier);
      }
      const normalizedName = supplier.name.trim().toLowerCase();
      if (normalizedName && !suppliersByName.has(normalizedName)) {
        suppliersByName.set(normalizedName, supplier);
      }
    }

    const createdRecords: PersistedCostRecordSummary[] = [];
    const outboxEvents: Prisma.OutboxEventCreateManyInput[] = [];

    for (const extractedRecord of records) {
      const locationLookupKey = extractedRecord.locationId?.trim();
      const costCenterLookupKey = extractedRecord.costCenterId?.trim();
      const locationId = locationLookupKey
        ? (locationCache.get(locationLookupKey) ?? undefined)
        : undefined;
      const costCenterId = costCenterLookupKey
        ? (costCenterCache.get(costCenterLookupKey) ?? undefined)
        : undefined;

      const supplierName = extractedRecord.supplier.name.trim();
      const supplierTaxId = extractedRecord.supplier.taxId?.trim();
      const normalizedSupplierName = supplierName.toLowerCase();
      const normalizedSupplierTaxId = supplierTaxId?.toLowerCase();

      let supplier =
        (normalizedSupplierTaxId ? suppliersByTaxId.get(normalizedSupplierTaxId) : undefined) ||
        suppliersByName.get(normalizedSupplierName);

      if (!supplier) {
        supplier = await tx.supplier.create({
          data: {
            name: supplierName,
            taxId: supplierTaxId,
            category: 'other',
            costTypes: [extractedRecord.costType],
            isActive: true,
          },
        });

        if (normalizedSupplierTaxId) {
          suppliersByTaxId.set(normalizedSupplierTaxId, supplier);
        }
        suppliersByName.set(normalizedSupplierName, supplier);
      }

      const costRecord = await tx.costRecord.create({
        data: {
          locationId,
          costCenterId,
          supplierId: supplier.id,
          sourceDocumentId: documentId,
          invoiceNumber: extractedRecord.externalId,
          periodStart: extractedRecord.periodStart,
          periodEnd: extractedRecord.periodEnd,
          invoiceDate: extractedRecord.invoiceDate,
          dueDate: extractedRecord.dueDate,
          amount: extractedRecord.amount,
          currency: extractedRecord.currency,
          amountNet: extractedRecord.amountNet,
          vatAmount: extractedRecord.vatAmount,
          vatRate: extractedRecord.vatRate,
          quantity: extractedRecord.quantity,
          unit: extractedRecord.unit,
          pricePerUnit: extractedRecord.pricePerUnit,
          costType: extractedRecord.costType,
          meterNumber: extractedRecord.meterNumber,
          contractNumber: extractedRecord.contractNumber,
          customerNumber: extractedRecord.customerNumber,
          confidence: extractedRecord.confidence,
          dataQuality: 'extracted',
          extractionMethod: extractedRecord.extractionMethod,
          anomalyStatus: 'ok',
        },
      });

      createdRecords.push({
        id: costRecord.id,
        amount: costRecord.amount,
        currency: costRecord.currency,
      });

      outboxEvents.push({
        aggregateType: 'cost_record',
        aggregateId: costRecord.id,
        eventType: 'cost_record.created',
        payload: {
          costRecordId: costRecord.id,
          amount: Number(costRecord.amount),
          costType: costRecord.costType,
          supplierId: costRecord.supplierId,
          periodStart: costRecord.periodStart.toISOString(),
          periodEnd: costRecord.periodEnd.toISOString(),
          isBackfill: isBackfill || false,
        },
      });
    }

    if (outboxEvents.length > 0) {
      await tx.outboxEvent.createMany({ data: outboxEvents });
    }

    return createdRecords;
  });
}
