import type { ExtractedCostRecord } from '@cost-watchdog/connector-sdk';
import type { PageText } from '../text-extractor.js';
import {
  extractPattern,
  patterns,
  parseGermanNumber,
  parseGermanDate,
} from '../text-extractor.js';

/**
 * Template extraction function type.
 */
export type TemplateExtractor = (pages: PageText[], fullText: string) => TemplateExtractionResult;

/**
 * Result of template-based extraction.
 */
export interface TemplateExtractionResult {
  success: boolean;
  records: Partial<ExtractedCostRecord>[];
  confidence: number;
  warnings: string[];
  error?: string;
}

/**
 * Template registry - maps template IDs to extraction functions.
 */
const templateRegistry = new Map<string, TemplateExtractor>();

/**
 * Register a template extractor.
 */
export function registerTemplate(templateId: string, extractor: TemplateExtractor): void {
  templateRegistry.set(templateId, extractor);
}

/**
 * Get a template extractor by ID.
 */
export function getTemplate(templateId: string): TemplateExtractor | undefined {
  return templateRegistry.get(templateId);
}

/**
 * List all registered template IDs.
 */
export function listTemplates(): string[] {
  return Array.from(templateRegistry.keys());
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC UTILITY EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generic utility invoice extractor.
 * Works for most German utility invoices with standard format.
 */
export function extractGenericUtility(pages: PageText[], fullText: string): TemplateExtractionResult {
  const warnings: string[] = [];
  const record: Partial<ExtractedCostRecord> = {
    currency: 'EUR',
    extractionMethod: 'template',
    manuallyVerified: false,
  };

  // Extract invoice number
  const invoiceNumbers = extractPattern(fullText, patterns.invoiceNumber);
  if (invoiceNumbers.length > 0) {
    record.externalId = invoiceNumbers[0];
  } else {
    warnings.push('Invoice number not found');
  }

  // Extract period
  const periodMatches = fullText.match(patterns.period);
  if (periodMatches) {
    const periodMatch = periodMatches[0].match(
      /(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*[-–bis]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i
    );
    if (periodMatch && periodMatch[1] && periodMatch[2]) {
      const start = parseGermanDate(periodMatch[1]);
      const end = parseGermanDate(periodMatch[2]);
      if (start) record.periodStart = start;
      if (end) record.periodEnd = end;
    }
  }

  if (!record.periodStart || !record.periodEnd) {
    // Try to find individual dates
    const dates = extractPattern(fullText, patterns.date);
    if (dates.length >= 2) {
      const parsedDates = dates.map(parseGermanDate).filter((d): d is Date => d !== null);
      if (parsedDates.length >= 2) {
        parsedDates.sort((a, b) => a.getTime() - b.getTime());
        record.periodStart = parsedDates[0];
        record.periodEnd = parsedDates[parsedDates.length - 1];
      }
    }
  }

  if (!record.periodStart || !record.periodEnd) {
    warnings.push('Period dates not found');
  }

  // Extract amounts - look for total/gross amount
  const amountPatterns = [
    /(?:Gesamt|Brutto|Total|Rechnungsbetrag|Zahlbetrag)[:\s]*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*(?:EUR|€)?/gi,
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*(?:EUR|€)?\s*(?:brutto|gesamt)/gi,
  ];

  for (const pattern of amountPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const amountStr = match[1] || match[0];
      const amount = parseGermanNumber(amountStr);
      if (!isNaN(amount) && amount > 0) {
        record.amount = amount;
        break;
      }
    }
  }

  if (!record.amount) {
    // Fall back to finding largest amount
    const amounts = extractPattern(fullText, patterns.amount);
    const parsedAmounts = amounts.map(parseGermanNumber).filter((a) => !isNaN(a) && a > 0);
    if (parsedAmounts.length > 0) {
      record.amount = Math.max(...parsedAmounts);
      warnings.push('Amount extracted from largest found value');
    }
  }

  if (!record.amount) {
    return {
      success: false,
      records: [],
      confidence: 0,
      warnings,
      error: 'Could not extract invoice amount',
    };
  }

  // Extract net amount and VAT
  const netPattern =
    /(?:Netto|Net)[:\s]*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*(?:EUR|€)?/gi;
  const netMatch = fullText.match(netPattern);
  if (netMatch) {
    const netStr = netMatch[0];
    const netAmount = parseGermanNumber(netStr);
    if (!isNaN(netAmount) && netAmount > 0) {
      record.amountNet = netAmount;
      record.vatAmount = record.amount - netAmount;
      // Calculate VAT rate
      if (record.amountNet > 0) {
        const vatRate = (record.vatAmount / record.amountNet) * 100;
        // Round to common VAT rates
        if (Math.abs(vatRate - 19) < 2) record.vatRate = 19;
        else if (Math.abs(vatRate - 7) < 1) record.vatRate = 7;
        else if (Math.abs(vatRate - 20) < 2) record.vatRate = 20; // Austria
        else if (Math.abs(vatRate - 8.1) < 1) record.vatRate = 8.1; // Switzerland
        else record.vatRate = Math.round(vatRate * 10) / 10;
      }
    }
  }

  // Extract consumption (kWh or m³)
  const kwhMatches = extractPattern(fullText, patterns.kwhConsumption);
  if (kwhMatches.length > 0 && kwhMatches[0]) {
    const consumption = parseGermanNumber(kwhMatches[0]);
    if (!isNaN(consumption)) {
      record.quantity = consumption;
      record.unit = 'kWh';
      if (record.amount && consumption > 0) {
        record.pricePerUnit = record.amount / consumption;
      }
    }
  } else {
    const m3Matches = extractPattern(fullText, patterns.cubicMeterConsumption);
    if (m3Matches.length > 0 && m3Matches[0]) {
      const consumption = parseGermanNumber(m3Matches[0]);
      if (!isNaN(consumption)) {
        record.quantity = consumption;
        record.unit = 'm³';
        if (record.amount && consumption > 0) {
          record.pricePerUnit = record.amount / consumption;
        }
      }
    }
  }

  // Extract meter number
  const meterNumbers = extractPattern(fullText, patterns.meterNumber);
  if (meterNumbers.length > 0) {
    record.meterNumber = meterNumbers[0];
  }

  // Extract contract number
  const contractNumbers = extractPattern(fullText, patterns.contractNumber);
  if (contractNumbers.length > 0) {
    record.contractNumber = contractNumbers[0];
  }

  // Extract customer number
  const customerNumbers = extractPattern(fullText, patterns.customerNumber);
  if (customerNumbers.length > 0) {
    record.customerNumber = customerNumbers[0];
  }

  // Calculate confidence based on extracted fields
  let confidence = 0.5;
  if (record.externalId) confidence += 0.1;
  if (record.periodStart && record.periodEnd) confidence += 0.15;
  if (record.amountNet) confidence += 0.1;
  if (record.quantity) confidence += 0.1;
  if (record.meterNumber || record.contractNumber) confidence += 0.05;

  record.confidence = Math.min(confidence, 0.95);

  return {
    success: true,
    records: [record],
    confidence: record.confidence,
    warnings,
  };
}

// Register the generic utility template
registerTemplate('generic_utility', extractGenericUtility);

// ═══════════════════════════════════════════════════════════════════════════
// E.ON TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function extractEonStandard(pages: PageText[], fullText: string): TemplateExtractionResult {
  // Start with generic extraction
  const result = extractGenericUtility(pages, fullText);

  if (result.success && result.records.length > 0) {
    const record = result.records[0];
    if (!record) return result;

    // E.ON specific: Look for "Verbrauch" section
    const verbrauchMatch = fullText.match(
      /Verbrauch[:\s]*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*kWh/i
    );
    if (verbrauchMatch && verbrauchMatch[1]) {
      record.quantity = parseGermanNumber(verbrauchMatch[1]);
      record.unit = 'kWh';
    }

    // E.ON specific cost type detection
    if (fullText.match(/Strom|Elektrizität|electricity/i)) {
      record.costType = 'electricity';
    } else if (fullText.match(/Gas|Erdgas/i)) {
      record.costType = 'natural_gas';
    }

    // Boost confidence for known template
    record.confidence = Math.min((record.confidence || 0.5) + 0.1, 0.95);
  }

  return result;
}

registerTemplate('eon_standard', extractEonStandard);

// ═══════════════════════════════════════════════════════════════════════════
// TELEKOM TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function extractTelekomStandard(pages: PageText[], fullText: string): TemplateExtractionResult {
  const warnings: string[] = [];
  const record: Partial<ExtractedCostRecord> = {
    currency: 'EUR',
    extractionMethod: 'template',
    manuallyVerified: false,
    costType: 'telecom_landline',
  };

  // Telekom invoice number format
  const invoiceMatch = fullText.match(/Rechnungsnummer[:\s]*(\d{10,})/i);
  if (invoiceMatch) {
    record.externalId = invoiceMatch[1];
  }

  // Telekom period format: "Abrechnungszeitraum: 01.01.2024 - 31.01.2024"
  const periodMatch = fullText.match(
    /Abrechnungszeitraum[:\s]*(\d{2}\.\d{2}\.\d{4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/i
  );
  if (periodMatch && periodMatch[1] && periodMatch[2]) {
    record.periodStart = parseGermanDate(periodMatch[1]) || undefined;
    record.periodEnd = parseGermanDate(periodMatch[2]) || undefined;
  }

  // Telekom total amount
  const totalMatch = fullText.match(
    /(?:Rechnungsbetrag|Gesamtbetrag)[:\s]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:EUR|€)/i
  );
  if (totalMatch && totalMatch[1]) {
    record.amount = parseGermanNumber(totalMatch[1]);
  }

  // Detect service type
  if (fullText.match(/MagentaMobil|Mobilfunk|Handy/i)) {
    record.costType = 'telecom_mobile';
  } else if (fullText.match(/MagentaZuhause|DSL|Festnetz/i)) {
    record.costType = 'telecom_landline';
  }

  // Customer number (Kundennummer)
  const customerMatch = fullText.match(/Kundennummer[:\s]*(\d+)/i);
  if (customerMatch) {
    record.customerNumber = customerMatch[1];
  }

  if (!record.amount) {
    return {
      success: false,
      records: [],
      confidence: 0,
      warnings,
      error: 'Could not extract Telekom invoice amount',
    };
  }

  record.confidence = 0.85;

  return {
    success: true,
    records: [record],
    confidence: record.confidence,
    warnings,
  };
}

registerTemplate('telekom_standard', extractTelekomStandard);

// Register placeholder templates for other suppliers
const placeholderExtractor: TemplateExtractor = (pages, fullText) => extractGenericUtility(pages, fullText);

registerTemplate('vattenfall_standard', placeholderExtractor);
registerTemplate('rwe_standard', placeholderExtractor);
registerTemplate('engie_standard', placeholderExtractor);
registerTemplate('vodafone_standard', placeholderExtractor);
registerTemplate('verbund_standard', placeholderExtractor);
registerTemplate('wien_energie_standard', placeholderExtractor);
registerTemplate('swisscom_standard', placeholderExtractor);
