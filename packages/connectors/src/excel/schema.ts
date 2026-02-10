import type { JSONSchema } from '@cost-watchdog/connector-sdk';

export const excelConfigSchema = {
  type: 'object',
  properties: {
    sheetName: { type: 'string' },
    sheetIndex: { type: 'number' },
    headerRow: { type: 'number' },
    startRow: { type: 'number' },
    dateFormat: { type: 'string' },
    decimalSeparator: { type: 'string', enum: ['.', ','] },
    skipEmptyRows: { type: 'boolean' },
    columnMappings: {
      type: 'object',
      properties: {
        periodStart: { type: 'string' },
        periodEnd: { type: 'string' },
        amount: { type: 'string' },
        amountNet: { type: 'string' },
        vatAmount: { type: 'string' },
        quantity: { type: 'string' },
        unit: { type: 'string' },
        pricePerUnit: { type: 'string' },
        costType: { type: 'string' },
        supplierName: { type: 'string' },
        invoiceNumber: { type: 'string' },
        location: { type: 'string' },
        contractNumber: { type: 'string' },
        meterNumber: { type: 'string' },
        currency: { type: 'string' },
      },
      required: ['periodStart', 'amount'],
    },
  },
  required: ['columnMappings'],
} as unknown as JSONSchema;
