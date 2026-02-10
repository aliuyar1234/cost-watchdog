import path from 'path';
import { ALLOWED_FILE_TYPES } from './config.js';
import type { SanitizedFilename } from './types.js';

// eslint-disable-next-line no-control-regex
const FORBIDDEN_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

const PATH_TRAVERSAL_PATTERNS = [/\.\./g, /^\.+$/, /^~/, /^\//];

const RESERVED_FILENAMES = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
];

export function sanitizeFilename(filename: string): SanitizedFilename {
  const original = filename;
  let sanitized = path.basename(filename);
  sanitized = sanitized.replace(FORBIDDEN_FILENAME_CHARS, '_');

  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  const nameWithoutExtension = (sanitized.split('.')[0] ?? '').toUpperCase();
  if (RESERVED_FILENAMES.includes(nameWithoutExtension)) {
    sanitized = `_${sanitized}`;
  }

  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

  if (sanitized.length === 0) {
    sanitized = 'unnamed_file';
  }

  const maxFileNameLength = 255;
  if (sanitized.length > maxFileNameLength) {
    const extension = path.extname(sanitized);
    const name = path.basename(sanitized, extension);
    sanitized = `${name.slice(0, maxFileNameLength - extension.length)}${extension}`;
  }

  return {
    original,
    sanitized,
    changed: original !== sanitized,
  };
}

export function validateFilenameExtension(
  filename: string,
  declaredMimeType: string,
): { valid: boolean; error?: string } {
  const extension = path.extname(filename).toLowerCase();
  const typeConfig = ALLOWED_FILE_TYPES[declaredMimeType];

  if (!typeConfig) {
    return {
      valid: false,
      error: `Unknown MIME type: ${declaredMimeType}`,
    };
  }

  if (!typeConfig.extensions.includes(extension)) {
    return {
      valid: false,
      error: `File extension '${extension}' does not match expected extensions for ${declaredMimeType}: ${typeConfig.extensions.join(', ')}`,
    };
  }

  return { valid: true };
}
