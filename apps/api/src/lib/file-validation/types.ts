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

export interface CompleteFileValidation {
  valid: boolean;
  sanitizedFilename: string;
  errors: string[];
}
