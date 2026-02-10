export interface DailyDigestWorkerConfig {
  pollIntervalMs?: number;
  maxAttempts?: number;
  runOnStartup?: boolean;
}

export interface DigestSummary {
  date: string;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  topAnomalies: Array<{
    type: string;
    severity: string;
    message: string;
    amount: number;
  }>;
}

export interface DigestEmailRecipient {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ClaimDigestRecordParams {
  digestKey: string;
  channel: string;
  recipient: string;
  userId?: string | null;
  windowStart: Date;
  windowEnd: Date;
  maxAttempts: number;
}
