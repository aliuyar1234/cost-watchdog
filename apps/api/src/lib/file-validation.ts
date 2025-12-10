/**
 * File Validation Library
 *
 * Provides secure file upload validation including:
 * - Magic byte (file signature) validation
 * - Filename sanitization (path traversal prevention)
 * - SVG JavaScript sanitization
 * - MIME type verification
 */

import { fileTypeFromBuffer } from 'file-type';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FileValidationResult {
  valid: boolean;
  detectedType: string | null;
  declaredType: string;
  error?: string;
}

export interface SanitizedFilename {
  original: string;
  sanitized: string;
  changed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOWED FILE TYPES CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapping of allowed MIME types to their expected magic byte signatures.
 * Some formats like CSV don't have magic bytes, so we handle them specially.
 */
export const ALLOWED_FILE_TYPES: Record<string, { extensions: string[]; hasMagicBytes: boolean }> = {
  'application/pdf': {
    extensions: ['.pdf'],
    hasMagicBytes: true,
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extensions: ['.xlsx'],
    hasMagicBytes: true,
  },
  'application/vnd.ms-excel': {
    extensions: ['.xls'],
    hasMagicBytes: true,
  },
  'text/csv': {
    extensions: ['.csv'],
    hasMagicBytes: false, // CSV is plain text, no magic bytes
  },
  'image/png': {
    extensions: ['.png'],
    hasMagicBytes: true,
  },
  'image/jpeg': {
    extensions: ['.jpg', '.jpeg'],
    hasMagicBytes: true,
  },
  'image/svg+xml': {
    extensions: ['.svg'],
    hasMagicBytes: false, // SVG is XML text
  },
};

/**
 * MIME types that match file-type's detected MIME type.
 * Some MIME types are detected differently by file-type.
 */
const MIME_TYPE_ALIASES: Record<string, string[]> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['application/zip'],
  'application/vnd.ms-excel': ['application/x-cfb', 'application/x-ole-storage'],
};

// ═══════════════════════════════════════════════════════════════════════════
// MAGIC BYTE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate file content against declared MIME type using magic bytes.
 *
 * @param buffer - File content buffer
 * @param declaredMimeType - MIME type declared in the upload header
 * @returns Validation result with detected type
 */
export async function validateFileMagicBytes(
  buffer: Buffer,
  declaredMimeType: string
): Promise<FileValidationResult> {
  const typeConfig = ALLOWED_FILE_TYPES[declaredMimeType];

  if (!typeConfig) {
    return {
      valid: false,
      detectedType: null,
      declaredType: declaredMimeType,
      error: `File type '${declaredMimeType}' is not allowed`,
    };
  }

  // For types without magic bytes, we can't verify by content
  if (!typeConfig.hasMagicBytes) {
    // For CSV, do basic validation (check it looks like text)
    if (declaredMimeType === 'text/csv') {
      const isValidCsv = validateCsvContent(buffer);
      if (!isValidCsv) {
        return {
          valid: false,
          detectedType: 'binary',
          declaredType: declaredMimeType,
          error: 'File content does not appear to be valid CSV',
        };
      }
    }

    // For SVG, validate it's XML and sanitize
    if (declaredMimeType === 'image/svg+xml') {
      const svgValidation = validateSvgContent(buffer);
      if (!svgValidation.valid) {
        return {
          valid: false,
          detectedType: 'unknown',
          declaredType: declaredMimeType,
          error: svgValidation.error,
        };
      }
    }

    return {
      valid: true,
      detectedType: declaredMimeType,
      declaredType: declaredMimeType,
    };
  }

  // Detect actual file type from magic bytes
  let detectedType;
  try {
    detectedType = await fileTypeFromBuffer(buffer);
  } catch (error) {
    // file-type can throw for very small buffers
    return {
      valid: false,
      detectedType: null,
      declaredType: declaredMimeType,
      error: 'File too small or corrupted to detect type',
    };
  }

  if (!detectedType) {
    return {
      valid: false,
      detectedType: null,
      declaredType: declaredMimeType,
      error: 'Could not determine file type from content',
    };
  }

  // Check if detected type matches declared type (or allowed alias)
  const allowedTypes = [declaredMimeType, ...(MIME_TYPE_ALIASES[declaredMimeType] || [])];

  if (!allowedTypes.includes(detectedType.mime)) {
    return {
      valid: false,
      detectedType: detectedType.mime,
      declaredType: declaredMimeType,
      error: `File content (${detectedType.mime}) does not match declared type (${declaredMimeType})`,
    };
  }

  return {
    valid: true,
    detectedType: detectedType.mime,
    declaredType: declaredMimeType,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Basic validation for CSV content.
 * Checks that the content is valid UTF-8 text without binary data.
 */
function validateCsvContent(buffer: Buffer): boolean {
  try {
    const text = buffer.toString('utf-8');

    // Check for null bytes (indicates binary content)
    if (text.includes('\0')) {
      return false;
    }

    // Check for common binary file signatures
    const binarySignatures = [
      '\x89PNG', // PNG
      '\xFF\xD8\xFF', // JPEG
      '%PDF', // PDF
      'PK\x03\x04', // ZIP/XLSX
      '\xD0\xCF\x11\xE0', // OLE (XLS)
    ];

    for (const sig of binarySignatures) {
      if (text.startsWith(sig)) {
        return false;
      }
    }

    // Basic structure check: should have at least one line
    const lines = text.split('\n');
    if (lines.length === 0) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SVG VALIDATION AND SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Patterns that indicate potentially malicious SVG content.
 */
const SVG_DANGEROUS_PATTERNS = [
  // Script tags
  /<script[\s>]/i,
  /<\/script>/i,
  // Event handlers
  /\bon\w+\s*=/i,
  // JavaScript URLs
  /javascript:/i,
  // Data URLs with scripts
  /data:text\/html/i,
  /data:application\/javascript/i,
  // External resources that could execute code
  /<foreignObject/i,
  // Use external resources
  /xlink:href\s*=\s*["'](?!#)/i, // External references (not internal anchors)
  // Embedded SVG with scripts
  /<svg[^>]*onload/i,
];

/**
 * Validate SVG content for security issues.
 */
function validateSvgContent(buffer: Buffer): { valid: boolean; error?: string } {
  try {
    const text = buffer.toString('utf-8');

    // Check it's XML-like
    if (!text.trim().startsWith('<')) {
      return { valid: false, error: 'File does not appear to be valid SVG/XML' };
    }

    // Check for SVG root element
    if (!/<svg[\s>]/i.test(text)) {
      return { valid: false, error: 'File does not contain SVG root element' };
    }

    // Check for dangerous patterns
    for (const pattern of SVG_DANGEROUS_PATTERNS) {
      if (pattern.test(text)) {
        return {
          valid: false,
          error: `SVG contains potentially dangerous content: ${pattern.source}`,
        };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Failed to parse SVG content' };
  }
}

/**
 * Sanitize SVG content by removing dangerous elements.
 * Returns sanitized SVG or null if sanitization fails.
 */
export function sanitizeSvg(buffer: Buffer): Buffer | null {
  try {
    let text = buffer.toString('utf-8');

    // Remove script tags
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Remove event handlers
    text = text.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: URLs
    text = text.replace(/javascript:[^"']*/gi, '');

    // Remove foreignObject tags (can contain HTML/scripts)
    text = text.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

    return Buffer.from(text, 'utf-8');
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILENAME SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Characters that are not allowed in filenames.
 * Includes path separators and special characters.
 */
const FORBIDDEN_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Patterns that could indicate path traversal attempts.
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./g, // Parent directory
  /^\.+$/, // Only dots
  /^~/, // Home directory shortcut
  /^\// // Absolute path (Unix)
];

/**
 * Reserved filenames on Windows.
 */
const RESERVED_FILENAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

/**
 * Sanitize a filename to prevent path traversal and other attacks.
 *
 * @param filename - Original filename from upload
 * @returns Sanitized filename safe for storage
 */
export function sanitizeFilename(filename: string): SanitizedFilename {
  const original = filename;
  let sanitized = filename;

  // Get just the filename part (remove any path)
  sanitized = path.basename(sanitized);

  // Remove forbidden characters
  sanitized = sanitized.replace(FORBIDDEN_FILENAME_CHARS, '_');

  // Remove path traversal patterns
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Check for reserved names (Windows)
  const nameWithoutExt = (sanitized.split('.')[0] ?? '').toUpperCase();
  if (RESERVED_FILENAMES.includes(nameWithoutExt)) {
    sanitized = `_${sanitized}`;
  }

  // Trim whitespace and dots from ends
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

  // Ensure we have a valid filename
  if (sanitized.length === 0) {
    sanitized = 'unnamed_file';
  }

  // Limit filename length
  const MAX_FILENAME_LENGTH = 255;
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }

  return {
    original,
    sanitized,
    changed: original !== sanitized,
  };
}

/**
 * Validate that a filename has an allowed extension for the declared MIME type.
 */
export function validateFilenameExtension(
  filename: string,
  declaredMimeType: string
): { valid: boolean; error?: string } {
  const ext = path.extname(filename).toLowerCase();
  const typeConfig = ALLOWED_FILE_TYPES[declaredMimeType];

  if (!typeConfig) {
    return { valid: false, error: `Unknown MIME type: ${declaredMimeType}` };
  }

  if (!typeConfig.extensions.includes(ext)) {
    return {
      valid: false,
      error: `File extension '${ext}' does not match expected extensions for ${declaredMimeType}: ${typeConfig.extensions.join(', ')}`,
    };
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE FILE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CompleteFileValidation {
  valid: boolean;
  sanitizedFilename: string;
  errors: string[];
}

/**
 * Perform complete file validation including magic bytes, filename, and extension.
 *
 * @param buffer - File content buffer
 * @param filename - Original filename
 * @param declaredMimeType - MIME type from upload header
 * @returns Complete validation result
 */
export async function validateFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType: string
): Promise<CompleteFileValidation> {
  const errors: string[] = [];

  // Sanitize filename
  const sanitizedFilename = sanitizeFilename(filename);

  // Validate extension matches MIME type
  const extValidation = validateFilenameExtension(sanitizedFilename.sanitized, declaredMimeType);
  if (!extValidation.valid) {
    errors.push(extValidation.error!);
  }

  // Validate magic bytes
  const magicValidation = await validateFileMagicBytes(buffer, declaredMimeType);
  if (!magicValidation.valid) {
    errors.push(magicValidation.error!);
  }

  return {
    valid: errors.length === 0,
    sanitizedFilename: sanitizedFilename.sanitized,
    errors,
  };
}
