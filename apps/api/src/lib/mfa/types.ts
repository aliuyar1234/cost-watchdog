export interface MfaEnrollmentResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
  enrollmentId: string;
}

export interface MfaVerificationResult {
  success: boolean;
  error?: string;
  remainingAttempts?: number;
  lockoutUntil?: Date;
}

export interface BackupCodeUseResult {
  success: boolean;
  error?: string;
  remainingCodes?: number;
}

export interface MfaRateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  lockoutUntil?: Date;
}
