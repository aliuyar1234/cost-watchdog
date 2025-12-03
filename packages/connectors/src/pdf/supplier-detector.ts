import { patterns, extractPattern } from './text-extractor.js';

/**
 * Known supplier patterns for detection.
 * These are used to identify suppliers by unique identifiers.
 */
export interface SupplierPattern {
  id: string;
  name: string;
  taxIds?: string[];
  ibans?: string[];
  namePatterns?: RegExp[];
  keywords?: string[];
  costTypes: string[];
  templateId?: string;
}

/**
 * Registry of known suppliers.
 * In production, this would be loaded from the database per tenant.
 */
export const knownSuppliers: SupplierPattern[] = [
  // German Energy Suppliers
  {
    id: 'eon',
    name: 'E.ON Energie Deutschland',
    taxIds: ['DE811148289'],
    namePatterns: [/E\.?ON/i, /EON\s*Energie/i],
    keywords: ['E.ON', 'Energie Deutschland'],
    costTypes: ['electricity', 'natural_gas'],
    templateId: 'eon_standard',
  },
  {
    id: 'vattenfall',
    name: 'Vattenfall Europe Sales',
    taxIds: ['DE267411906'],
    namePatterns: [/Vattenfall/i],
    keywords: ['Vattenfall', 'Europe Sales'],
    costTypes: ['electricity', 'natural_gas', 'district_heating'],
    templateId: 'vattenfall_standard',
  },
  {
    id: 'rwe',
    name: 'RWE AG',
    taxIds: ['DE113891919'],
    namePatterns: [/RWE/i, /innogy/i],
    keywords: ['RWE', 'innogy'],
    costTypes: ['electricity', 'natural_gas'],
    templateId: 'rwe_standard',
  },
  {
    id: 'engie',
    name: 'ENGIE Deutschland',
    taxIds: ['DE813163514'],
    namePatterns: [/ENGIE/i, /GDF\s*SUEZ/i],
    keywords: ['ENGIE', 'GDF SUEZ'],
    costTypes: ['electricity', 'natural_gas'],
    templateId: 'engie_standard',
  },
  // Telecom
  {
    id: 'telekom',
    name: 'Deutsche Telekom',
    taxIds: ['DE123475223'],
    namePatterns: [/Deutsche\s*Telekom/i, /T-Mobile/i, /Telekom\s*Deutschland/i],
    keywords: ['Telekom', 'T-Mobile', 'MagentaEINS'],
    costTypes: ['telecom_mobile', 'telecom_landline', 'telecom_internet'],
    templateId: 'telekom_standard',
  },
  {
    id: 'vodafone',
    name: 'Vodafone GmbH',
    taxIds: ['DE812932054'],
    namePatterns: [/Vodafone/i, /Kabel\s*Deutschland/i],
    keywords: ['Vodafone', 'Kabel Deutschland'],
    costTypes: ['telecom_mobile', 'telecom_landline', 'telecom_internet'],
    templateId: 'vodafone_standard',
  },
  // Austrian Suppliers
  {
    id: 'verbund',
    name: 'VERBUND AG',
    taxIds: ['ATU14703908'],
    namePatterns: [/VERBUND/i],
    keywords: ['VERBUND', 'Österreichische Elektrizitätswirtschafts'],
    costTypes: ['electricity'],
    templateId: 'verbund_standard',
  },
  {
    id: 'wien_energie',
    name: 'Wien Energie',
    taxIds: ['ATU37807505'],
    namePatterns: [/Wien\s*Energie/i],
    keywords: ['Wien Energie', 'Wiener Stadtwerke'],
    costTypes: ['electricity', 'natural_gas', 'district_heating'],
    templateId: 'wien_energie_standard',
  },
  // Swiss Suppliers
  {
    id: 'swisscom',
    name: 'Swisscom AG',
    taxIds: ['CHE-108.910.034'],
    namePatterns: [/Swisscom/i],
    keywords: ['Swisscom'],
    costTypes: ['telecom_mobile', 'telecom_landline', 'telecom_internet'],
    templateId: 'swisscom_standard',
  },
];

/**
 * Result of supplier detection.
 */
export interface SupplierDetectionResult {
  detected: boolean;
  supplier?: SupplierPattern;
  confidence: number;
  method: 'tax_id' | 'iban' | 'name_pattern' | 'keyword' | 'unknown';
  matchedValue?: string;
}

/**
 * Detect supplier from extracted PDF text.
 *
 * Detection priority:
 * 1. Tax ID (highest confidence)
 * 2. IBAN
 * 3. Name patterns
 * 4. Keywords
 *
 * @param text - Full text from PDF
 * @param customSuppliers - Additional tenant-specific suppliers
 * @returns Detection result with supplier info
 */
export function detectSupplier(
  text: string,
  customSuppliers: SupplierPattern[] = []
): SupplierDetectionResult {
  const allSuppliers = [...customSuppliers, ...knownSuppliers];

  // 1. Try to match by Tax ID (highest confidence)
  const taxIds = extractPattern(text, patterns.taxId);
  for (const taxId of taxIds) {
    const normalizedTaxId = taxId.replace(/[\s.-]/g, '').toUpperCase();
    for (const supplier of allSuppliers) {
      if (supplier.taxIds?.some((t) => t.replace(/[\s.-]/g, '').toUpperCase() === normalizedTaxId)) {
        return {
          detected: true,
          supplier,
          confidence: 0.95,
          method: 'tax_id',
          matchedValue: taxId,
        };
      }
    }
  }

  // 2. Try to match by IBAN
  const ibans = extractPattern(text, patterns.iban);
  for (const iban of ibans) {
    const normalizedIban = iban.replace(/\s/g, '').toUpperCase();
    for (const supplier of allSuppliers) {
      if (supplier.ibans?.some((i) => i.replace(/\s/g, '').toUpperCase() === normalizedIban)) {
        return {
          detected: true,
          supplier,
          confidence: 0.9,
          method: 'iban',
          matchedValue: iban,
        };
      }
    }
  }

  // 3. Try to match by name patterns
  for (const supplier of allSuppliers) {
    if (supplier.namePatterns) {
      for (const pattern of supplier.namePatterns) {
        const match = text.match(pattern);
        if (match) {
          return {
            detected: true,
            supplier,
            confidence: 0.8,
            method: 'name_pattern',
            matchedValue: match[0],
          };
        }
      }
    }
  }

  // 4. Try to match by keywords
  const textUpper = text.toUpperCase();
  for (const supplier of allSuppliers) {
    if (supplier.keywords) {
      for (const keyword of supplier.keywords) {
        if (textUpper.includes(keyword.toUpperCase())) {
          return {
            detected: true,
            supplier,
            confidence: 0.6,
            method: 'keyword',
            matchedValue: keyword,
          };
        }
      }
    }
  }

  // No supplier detected
  return {
    detected: false,
    confidence: 0,
    method: 'unknown',
  };
}

/**
 * Extract supplier name from text when no known supplier is matched.
 * Attempts to find company names near typical invoice header positions.
 */
export function extractUnknownSupplierName(text: string): string | null {
  // Look for company suffixes
  const companySuffixes = ['GmbH', 'AG', 'SE', 'KG', 'e.V.', 'mbH', 'Co. KG', 'OHG'];

  for (const suffix of companySuffixes) {
    const regex = new RegExp(`([A-ZÄÖÜ][A-Za-zäöüÄÖÜß\\s&.-]+\\s${suffix})`, 'g');
    const match = text.match(regex);
    if (match && match[0]) {
      return match[0].trim();
    }
  }

  // Try to find name from first lines (usually letterhead)
  const lines = text.split('\n').slice(0, 10);
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for lines that look like company names (capitalized, 2-6 words)
    if (trimmed.length > 5 && trimmed.length < 100) {
      const words = trimmed.split(/\s+/);
      if (words.length >= 2 && words.length <= 6) {
        // Check if first letter is capitalized
        if (/^[A-ZÄÖÜ]/.test(trimmed)) {
          return trimmed;
        }
      }
    }
  }

  return null;
}
