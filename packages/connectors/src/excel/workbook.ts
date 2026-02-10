import type { Worksheet } from 'exceljs';
import type { ExcelExtractionConfig } from './types.js';

export async function loadWorkbook(inputBuffer: Buffer): Promise<import('exceljs').Workbook> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(inputBuffer as unknown as ArrayBuffer);
  return workbook;
}

export function selectWorksheet(
  workbook: import('exceljs').Workbook,
  config: ExcelExtractionConfig,
): Worksheet | undefined {
  if (config.sheetName) {
    return workbook.getWorksheet(config.sheetName);
  }
  if (config.sheetIndex !== undefined) {
    return workbook.worksheets[config.sheetIndex];
  }
  return workbook.worksheets[0];
}

function resolveCellValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'result' in value) {
    return (value as { result?: unknown }).result;
  }

  if (value && typeof value === 'object' && 'richText' in value) {
    const richText = (value as { richText?: Array<{ text: string }> }).richText || [];
    return richText.map((part) => part.text).join('');
  }

  return value;
}

export function worksheetToRows(worksheet: Worksheet): unknown[][] {
  const rows: unknown[][] = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const rowValues: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      while (rowValues.length < columnNumber - 1) {
        rowValues.push(null);
      }
      rowValues.push(resolveCellValue(cell.value));
    });
    rows.push(rowValues);
  });

  return rows;
}
