import type { JSONSchema } from '@cost-watchdog/connector-sdk';

export const csvConfigSchema = {
  type: 'object',
  properties: {
    delimiter: { type: 'string' },
    quoteChar: { type: 'string' },
    hasHeader: { type: 'boolean' },
    headerRow: { type: 'number' },
    startRow: { type: 'number' },
    encoding: { type: 'string' },
    dateFormat: { type: 'string' },
    decimalSeparator: { type: 'string', enum: ['.', ','] },
    skipEmptyRows: { type: 'boolean' },
    columnMappings: {
      type: 'object',
      properties: {
        periodStart: { type: ['string', 'number'] },
        periodEnd: { type: ['string', 'number'] },
        amount: { type: ['string', 'number'] },
        amountNet: { type: ['string', 'number'] },
        vatAmount: { type: ['string', 'number'] },
        quantity: { type: ['string', 'number'] },
        unit: { type: ['string', 'number'] },
        pricePerUnit: { type: ['string', 'number'] },
        costType: { type: ['string', 'number'] },
        supplierName: { type: ['string', 'number'] },
        invoiceNumber: { type: ['string', 'number'] },
        location: { type: ['string', 'number'] },
        contractNumber: { type: ['string', 'number'] },
        meterNumber: { type: ['string', 'number'] },
        currency: { type: ['string', 'number'] },
      },
      required: ['periodStart', 'amount'],
    },
  },
  required: ['columnMappings'],
} as unknown as JSONSchema;
