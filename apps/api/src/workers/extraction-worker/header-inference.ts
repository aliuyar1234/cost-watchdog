import type { CsvColumnMappings, ExcelColumnMappings } from '@cost-watchdog/connectors';

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t'] as const;
  let best: (typeof candidates)[number] = ',';
  let bestCount = -1;

  for (const delimiter of candidates) {
    const count = line.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }

  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells.map((cell, index) => (index === 0 ? cell.replace(/^\uFEFF/, '') : cell));
}

type HeaderCandidateMap<T> = Record<keyof T, string[]>;

const CSV_HEADER_CANDIDATES: HeaderCandidateMap<CsvColumnMappings> = {
  periodStart: ['periodStart', 'period_start', 'start', 'from', 'von', 'beginn', 'date'],
  periodEnd: ['periodEnd', 'period_end', 'end', 'to', 'bis'],
  amount: ['amount', 'betrag', 'sum', 'total', 'kosten'],
  amountNet: ['amountNet', 'amount_net', 'net', 'netto'],
  vatAmount: ['vatAmount', 'vat_amount', 'vat', 'mwst', 'ust'],
  quantity: ['quantity', 'menge', 'verbrauch', 'consumption'],
  unit: ['unit', 'einheit'],
  pricePerUnit: ['pricePerUnit', 'price_per_unit', 'preisproeinheit', 'preis'],
  costType: ['costType', 'cost_type', 'kostenart', 'type'],
  supplierName: ['supplierName', 'supplier_name', 'supplier', 'lieferant'],
  invoiceNumber: ['invoiceNumber', 'invoice_number', 'invoice', 'rechnung', 'rechnungsnummer'],
  location: ['location', 'standort', 'site'],
  contractNumber: ['contractNumber', 'contract_number', 'contract', 'vertrag'],
  meterNumber: ['meterNumber', 'meter_number', 'meter', 'zaehler'],
  currency: ['currency', 'waehrung', 'w\u00e4hrung'],
};

const EXCEL_HEADER_CANDIDATES: HeaderCandidateMap<ExcelColumnMappings> = {
  periodStart: CSV_HEADER_CANDIDATES.periodStart,
  periodEnd: CSV_HEADER_CANDIDATES.periodEnd,
  amount: CSV_HEADER_CANDIDATES.amount,
  amountNet: CSV_HEADER_CANDIDATES.amountNet,
  vatAmount: CSV_HEADER_CANDIDATES.vatAmount,
  quantity: CSV_HEADER_CANDIDATES.quantity,
  unit: CSV_HEADER_CANDIDATES.unit,
  pricePerUnit: CSV_HEADER_CANDIDATES.pricePerUnit,
  costType: CSV_HEADER_CANDIDATES.costType,
  supplierName: CSV_HEADER_CANDIDATES.supplierName,
  invoiceNumber: CSV_HEADER_CANDIDATES.invoiceNumber,
  location: CSV_HEADER_CANDIDATES.location,
  contractNumber: CSV_HEADER_CANDIDATES.contractNumber,
  meterNumber: CSV_HEADER_CANDIDATES.meterNumber,
  currency: CSV_HEADER_CANDIDATES.currency,
};

function selectHeaderMatch(lookup: Map<string, string>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeHeader(candidate);
    const match = lookup.get(normalized);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function inferColumnMappings<T extends object>(
  headers: string[],
  candidates: HeaderCandidateMap<T>,
  required: Array<keyof T>,
): Partial<T> | null {
  const lookup = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) {
      continue;
    }

    if (!lookup.has(normalized)) {
      lookup.set(normalized, header);
    }
  }

  const mapping: Record<string, unknown> = {};
  for (const key of Object.keys(candidates) as Array<keyof T>) {
    const match = selectHeaderMatch(lookup, candidates[key]);
    if (match) {
      mapping[key as string] = match;
    }
  }

  for (const key of required) {
    if (!((key as string) in mapping)) {
      return null;
    }
  }

  return mapping as Partial<T>;
}

export function inferCsvConfig(buffer: Buffer): {
  config: {
    columnMappings: CsvColumnMappings;
    hasHeader: true;
    headerRow: number;
    startRow: number;
  };
} | null {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return null;
  }

  const firstLine = nonEmpty[0];
  if (!firstLine) {
    return null;
  }

  const delimiter = detectDelimiter(firstLine);
  const scanLimit = Math.min(10, nonEmpty.length);

  for (let index = 0; index < scanLimit; index += 1) {
    const cells = splitCsvLine(nonEmpty[index] ?? '', delimiter).filter(
      (value) => value.length > 0,
    );
    if (cells.length < 2) {
      continue;
    }

    const mapping = inferColumnMappings<CsvColumnMappings>(cells, CSV_HEADER_CANDIDATES, [
      'periodStart',
      'amount',
    ]);

    if (mapping) {
      return {
        config: {
          columnMappings: mapping as CsvColumnMappings,
          hasHeader: true,
          headerRow: index + 1,
          startRow: index + 2,
        },
      };
    }
  }

  return null;
}

export async function inferExcelConfig(buffer: Buffer): Promise<{
  config: {
    columnMappings: ExcelColumnMappings;
    headerRow: number;
    startRow: number;
    skipEmptyRows: true;
  };
} | null> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return null;
  }

  const scanLimit = Math.min(10, worksheet.rowCount);
  for (let rowNumber = 1; rowNumber <= scanLimit; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Array.isArray(row.values) ? (row.values.slice(1) as unknown[]) : [];
    const headers = values
      .map((value) => (value === null || value === undefined ? '' : String(value)))
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (headers.length < 2) {
      continue;
    }

    const mapping = inferColumnMappings<ExcelColumnMappings>(headers, EXCEL_HEADER_CANDIDATES, [
      'periodStart',
      'amount',
    ]);

    if (mapping) {
      return {
        config: {
          columnMappings: mapping as ExcelColumnMappings,
          headerRow: rowNumber,
          startRow: rowNumber + 1,
          skipEmptyRows: true,
        },
      };
    }
  }

  return null;
}
