import { fileTypeFromBuffer } from 'file-type';
import { validateCsvContent } from './csv.js';
import { ALLOWED_FILE_TYPES, MIME_TYPE_ALIASES } from './config.js';
import { validateSvgContent } from './svg.js';
import type { FileValidationResult } from './types.js';

export async function validateFileMagicBytes(
  buffer: Buffer,
  declaredMimeType: string,
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

  if (!typeConfig.hasMagicBytes) {
    if (declaredMimeType === 'text/csv' && !validateCsvContent(buffer)) {
      return {
        valid: false,
        detectedType: 'binary',
        declaredType: declaredMimeType,
        error: 'File content does not appear to be valid CSV',
      };
    }

    if (declaredMimeType === 'text/csv') {
      try {
        const detectedBinaryType = await fileTypeFromBuffer(buffer);
        if (detectedBinaryType) {
          return {
            valid: false,
            detectedType: detectedBinaryType.mime,
            declaredType: declaredMimeType,
            error: `File content (${detectedBinaryType.mime}) does not match declared type (${declaredMimeType})`,
          };
        }
      } catch {
        // Ignore detection errors for plain-text formats.
      }
    }

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

  let detectedType;
  try {
    detectedType = await fileTypeFromBuffer(buffer);
  } catch {
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
