export const EXTRACTION_TOOL = {
  name: 'extract_invoice_data',
  description: 'Extract structured data from an invoice or bill document',
  input_schema: {
    type: 'object' as const,
    properties: {
      invoiceNumber: {
        type: 'string',
        description: 'Invoice or bill number',
      },
      invoiceDate: {
        type: 'string',
        description: 'Invoice date in YYYY-MM-DD format',
      },
      periodStart: {
        type: 'string',
        description: 'Billing period start date in YYYY-MM-DD format',
      },
      periodEnd: {
        type: 'string',
        description: 'Billing period end date in YYYY-MM-DD format',
      },
      dueDate: {
        type: 'string',
        description: 'Payment due date in YYYY-MM-DD format',
      },
      amount: {
        type: 'number',
        description: 'Total gross amount (including VAT)',
        minimum: 0,
      },
      amountNet: {
        type: 'number',
        description: 'Net amount (excluding VAT)',
        minimum: 0,
      },
      vatAmount: {
        type: 'number',
        description: 'VAT amount',
        minimum: 0,
      },
      vatRate: {
        type: 'number',
        description: 'VAT rate as percentage (for example 19 for 19%)',
      },
      currency: {
        type: 'string',
        enum: ['EUR', 'CHF', 'USD'],
        description: 'Currency code',
      },
      quantity: {
        type: 'number',
        description: 'Consumption quantity (for example kWh or m3)',
        minimum: 0,
      },
      unit: {
        type: 'string',
        enum: ['kWh', 'MWh', 'm3', 'liter', 'kg', 'tonne', 'piece', 'user', 'GB'],
        description: 'Unit of consumption',
      },
      pricePerUnit: {
        type: 'number',
        description: 'Price per unit of consumption',
      },
      supplierName: {
        type: 'string',
        description: 'Name of the supplier or vendor',
      },
      supplierTaxId: {
        type: 'string',
        description: 'Supplier VAT or Tax ID (for example DE123456789)',
      },
      costType: {
        type: 'string',
        enum: [
          'electricity',
          'natural_gas',
          'district_heating',
          'heating_oil',
          'water',
          'waste',
          'telecom_landline',
          'telecom_mobile',
          'telecom_internet',
          'rent',
          'insurance',
          'maintenance',
          'operating_costs',
          'it_licenses',
          'it_cloud',
          'it_hardware',
          'other',
        ],
        description: 'Type of cost or service',
      },
      meterNumber: {
        type: 'string',
        description: 'Meter or counter number',
      },
      contractNumber: {
        type: 'string',
        description: 'Contract number',
      },
      customerNumber: {
        type: 'string',
        description: 'Customer number',
      },
    },
    required: ['amount', 'currency', 'periodStart', 'periodEnd', 'costType', 'supplierName'],
  },
};
