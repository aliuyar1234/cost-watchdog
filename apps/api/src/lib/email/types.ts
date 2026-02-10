export interface AnomalyAlertEmailData {
  recipientEmail: string | string[];
  recipientName: string;
  anomalyType: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  costType: string;
  supplierName: string;
  locationName: string;
  amount: number;
  expectedAmount?: number;
  deviationPercent?: number;
  periodStart: string;
  periodEnd: string;
  anomalyId: string;
  dashboardUrl: string;
}

export interface DailyDigestEmailData {
  recipientEmail: string;
  recipientName: string;
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
  dashboardUrl: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
