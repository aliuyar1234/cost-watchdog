import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Extracted text content from a PDF page.
 */
export interface PageText {
  pageNumber: number;
  text: string;
  lines: string[];
}

/**
 * Result of PDF text extraction.
 */
export interface TextExtractionResult {
  success: boolean;
  pages: PageText[];
  fullText: string;
  pageCount: number;
  error?: string;
}

/**
 * Extract text from a PDF buffer.
 * Uses pdf.js for embedded text extraction.
 *
 * @param buffer - PDF file buffer
 * @returns Extracted text from all pages
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
  try {
    // Convert Buffer to Uint8Array for pdf.js
    const data = new Uint8Array(buffer);

    // Load PDF document
    const loadingTask = getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdf: PDFDocumentProxy = await loadingTask.promise;
    const pages: PageText[] = [];

    // Extract text from each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Combine text items into lines
      const items = textContent.items as Array<{ str: string; transform: number[] }>;
      let currentY: number | null = null;
      let currentLine = '';
      const lines: string[] = [];

      for (const item of items) {
        const y = item.transform[5]; // Y position

        // New line detection based on Y position change
        if (currentY !== null && y !== undefined && Math.abs(y - currentY) > 5) {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }
          currentLine = '';
        }

        currentLine += item.str;
        currentY = y ?? null;
      }

      // Add last line
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }

      pages.push({
        pageNumber: i,
        text: lines.join('\n'),
        lines,
      });
    }

    const fullText = pages.map((p) => p.text).join('\n\n');

    return {
      success: true,
      pages,
      fullText,
      pageCount: pdf.numPages,
    };
  } catch (error) {
    return {
      success: false,
      pages: [],
      fullText: '',
      pageCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error during PDF text extraction',
    };
  }
}

/**
 * Check if extracted text is likely from a scanned PDF (mostly empty or garbage).
 *
 * @param result - Text extraction result
 * @returns True if the PDF appears to be scanned/image-based
 */
export function isScannedPdf(result: TextExtractionResult): boolean {
  if (!result.success) return true;

  // Check for minimal text content
  const charCount = result.fullText.replace(/\s/g, '').length;
  const expectedMinChars = result.pageCount * 100; // At least 100 chars per page

  if (charCount < expectedMinChars) {
    return true;
  }

  // Check for high ratio of non-alphanumeric characters (OCR garbage)
  const alphanumericCount = (result.fullText.match(/[a-zA-Z0-9äöüÄÖÜß]/g) || []).length;
  const ratio = alphanumericCount / charCount;

  return ratio < 0.5;
}

/**
 * Extract specific patterns from text.
 */
export const patterns = {
  // German date formats: DD.MM.YYYY or DD/MM/YYYY
  date: /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g,

  // Money amounts: 1.234,56 € or EUR 1234.56
  amount: /(?:EUR|€|CHF)?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*(?:EUR|€|CHF)?/gi,

  // German tax ID (UID): DE123456789 or ATU12345678
  taxId: /\b(DE\d{9}|ATU\d{8}|CHE-\d{3}\.\d{3}\.\d{3})\b/gi,

  // IBAN
  iban: /\b([A-Z]{2}\d{2}(?:\s?\d{4}){4,7})\b/gi,

  // Invoice number patterns
  invoiceNumber: /(?:Rechnungs?(?:nummer|nr\.?)?|Invoice\s*(?:No\.?|Number)?)[:\s]*([A-Z0-9-/]+)/gi,

  // Contract number
  contractNumber: /(?:Vertrags?(?:nummer|nr\.?)?|Contract\s*(?:No\.?)?)[:\s]*([A-Z0-9-/]+)/gi,

  // Customer number
  customerNumber: /(?:Kunden(?:nummer|nr\.?)?|Customer\s*(?:No\.?)?)[:\s]*([A-Z0-9-/]+)/gi,

  // Meter number (for utilities)
  meterNumber: /(?:Zähler(?:nummer|nr\.?)?|Meter\s*(?:No\.?)?)[:\s]*([A-Z0-9-/]+)/gi,

  // Period: 01.01.2024 - 31.01.2024
  period: /(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*[-–bis]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/gi,

  // kWh consumption
  kwhConsumption: /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*kWh/gi,

  // m³ consumption (gas, water)
  cubicMeterConsumption: /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*m[³3]/gi,
};

/**
 * Extract all matches for a pattern from text.
 */
export function extractPattern(text: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match;

  // Reset regex state
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    matches.push(match[1] || match[0]);
  }

  return matches;
}

/**
 * Parse German-formatted number (1.234,56) to JavaScript number.
 */
export function parseGermanNumber(str: string): number {
  // Remove currency symbols and whitespace
  const cleaned = str.replace(/[€EUR CHF\s]/gi, '').trim();

  // German format: 1.234,56 -> 1234.56
  // Check if comma is decimal separator
  if (cleaned.includes(',') && cleaned.indexOf(',') > cleaned.lastIndexOf('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }

  // Already in English format or no separators
  return parseFloat(cleaned.replace(/,/g, ''));
}

/**
 * Parse German date string to Date object.
 */
export function parseGermanDate(str: string): Date | null {
  const match = str.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // Months are 0-indexed
  const year = parseInt(match[3], 10);

  const date = new Date(year, month, day);

  // Validate the date
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    return null;
  }

  return date;
}
