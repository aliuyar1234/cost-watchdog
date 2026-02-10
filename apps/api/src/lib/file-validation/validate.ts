import { sanitizeFilename, validateFilenameExtension } from './filename.js';
import { validateFileMagicBytes } from './magic-bytes.js';
import type { CompleteFileValidation } from './types.js';

export async function validateFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType: string,
): Promise<CompleteFileValidation> {
  const errors: string[] = [];

  const sanitizedFilename = sanitizeFilename(filename);

  const extensionValidation = validateFilenameExtension(
    sanitizedFilename.sanitized,
    declaredMimeType,
  );
  if (!extensionValidation.valid && extensionValidation.error) {
    errors.push(extensionValidation.error);
  }

  const magicValidation = await validateFileMagicBytes(buffer, declaredMimeType);
  if (!magicValidation.valid && magicValidation.error) {
    errors.push(magicValidation.error);
  }

  return {
    valid: errors.length === 0,
    sanitizedFilename: sanitizedFilename.sanitized,
    errors,
  };
}
