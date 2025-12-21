import { Resend } from 'resend';
import { secrets } from './secrets.js';

/**
 * Email service for sending alerts and notifications.
 * Uses Resend as the email provider.
 */

// Initialize Resend client
const RESEND_API_KEY = secrets.getResendApiKey();
const resend = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

/**
 * Email configuration
 */
const EMAIL_CONFIG = {
  from: process.env['EMAIL_FROM'] || 'Cost Watchdog <alerts@costwatchdog.de>',
  replyTo: process.env['EMAIL_REPLY_TO'] || 'support@costwatchdog.de',
};

/**
 * Email template data for anomaly alerts
 */
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

/**
 * Email template data for daily digest
 */
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

/**
 * Result of sending an email
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Get severity color for HTML emails
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#dc2626'; // red-600
    case 'warning':
      return '#d97706'; // amber-600
    default:
      return '#2563eb'; // blue-600
  }
}

/**
 * Get severity label in German
 */
function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'Kritisch';
    case 'warning':
      return 'Warnung';
    default:
      return 'Info';
  }
}

/**
 * Generate HTML for anomaly alert email
 */
function generateAnomalyAlertHtml(data: AnomalyAlertEmailData): string {
  const severityColor = getSeverityColor(data.severity);
  const severityLabel = getSeverityLabel(data.severity);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kostenanomalie erkannt</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🔍 Cost Watchdog</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Kostenanomalie erkannt</p>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hallo ${data.recipientName},</p>

    <p>wir haben eine Anomalie in Ihren Kostendaten erkannt:</p>

    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid ${severityColor};">
      <div style="display: flex; align-items: center; margin-bottom: 15px;">
        <span style="background: ${severityColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
          ${severityLabel}
        </span>
      </div>

      <h3 style="margin: 0 0 10px 0; color: #1f2937;">${data.message}</h3>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Lieferant:</td>
          <td style="padding: 8px 0; font-weight: 500;">${data.supplierName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Standort:</td>
          <td style="padding: 8px 0; font-weight: 500;">${data.locationName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Kostenart:</td>
          <td style="padding: 8px 0; font-weight: 500;">${data.costType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Betrag:</td>
          <td style="padding: 8px 0; font-weight: 600; color: ${severityColor};">${formatCurrency(data.amount)}</td>
        </tr>
        ${data.expectedAmount ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Erwartet:</td>
          <td style="padding: 8px 0;">${formatCurrency(data.expectedAmount)}</td>
        </tr>
        ` : ''}
        ${data.deviationPercent ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Abweichung:</td>
          <td style="padding: 8px 0; font-weight: 500; color: ${severityColor};">${data.deviationPercent > 0 ? '+' : ''}${data.deviationPercent.toFixed(1)}%</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Zeitraum:</td>
          <td style="padding: 8px 0;">${data.periodStart} - ${data.periodEnd}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.dashboardUrl}/anomalies/${data.anomalyId}"
         style="background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
        Anomalie prüfen
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
      Sie können diese Anomalie im Dashboard bestätigen, ablehnen oder als Fehlalarm markieren.
    </p>
  </div>

  <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">
      Diese E-Mail wurde automatisch von Cost Watchdog gesendet.<br>
      <a href="${data.dashboardUrl}/settings/notifications" style="color: #6b7280;">Benachrichtigungseinstellungen ändern</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text for anomaly alert email
 */
function generateAnomalyAlertText(data: AnomalyAlertEmailData): string {
  const severityLabel = getSeverityLabel(data.severity);

  return `
Cost Watchdog - Kostenanomalie erkannt

Hallo ${data.recipientName},

wir haben eine Anomalie in Ihren Kostendaten erkannt:

[${severityLabel}] ${data.message}

Details:
- Lieferant: ${data.supplierName}
- Standort: ${data.locationName}
- Kostenart: ${data.costType}
- Betrag: ${formatCurrency(data.amount)}
${data.expectedAmount ? `- Erwartet: ${formatCurrency(data.expectedAmount)}` : ''}
${data.deviationPercent ? `- Abweichung: ${data.deviationPercent > 0 ? '+' : ''}${data.deviationPercent.toFixed(1)}%` : ''}
- Zeitraum: ${data.periodStart} - ${data.periodEnd}

Anomalie prüfen: ${data.dashboardUrl}/anomalies/${data.anomalyId}

---
Diese E-Mail wurde automatisch von Cost Watchdog gesendet.
Benachrichtigungseinstellungen: ${data.dashboardUrl}/settings/notifications
  `.trim();
}

/**
 * Generate HTML for daily digest email
 */
function generateDailyDigestHtml(data: DailyDigestEmailData): string {
  const totalCount = data.criticalCount + data.warningCount + data.infoCount;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tägliche Zusammenfassung</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">📊 Cost Watchdog</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Tägliche Zusammenfassung - ${data.date}</p>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hallo ${data.recipientName},</p>

    <p>hier ist Ihre tägliche Zusammenfassung der Kostenanomalien:</p>

    <div style="display: flex; gap: 15px; margin: 20px 0;">
      <div style="flex: 1; background: white; border-radius: 8px; padding: 15px; text-align: center; border: 1px solid #e5e7eb;">
        <div style="font-size: 28px; font-weight: 700; color: #dc2626;">${data.criticalCount}</div>
        <div style="font-size: 12px; color: #6b7280;">Kritisch</div>
      </div>
      <div style="flex: 1; background: white; border-radius: 8px; padding: 15px; text-align: center; border: 1px solid #e5e7eb;">
        <div style="font-size: 28px; font-weight: 700; color: #d97706;">${data.warningCount}</div>
        <div style="font-size: 12px; color: #6b7280;">Warnungen</div>
      </div>
      <div style="flex: 1; background: white; border-radius: 8px; padding: 15px; text-align: center; border: 1px solid #e5e7eb;">
        <div style="font-size: 28px; font-weight: 700; color: #2563eb;">${data.infoCount}</div>
        <div style="font-size: 12px; color: #6b7280;">Info</div>
      </div>
    </div>

    ${totalCount > 0 ? `
    <h3 style="margin: 25px 0 15px 0; font-size: 16px;">Top Anomalien</h3>
    ${data.topAnomalies.map(a => `
    <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid ${getSeverityColor(a.severity)};">
      <div style="font-weight: 500;">${a.message}</div>
      <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">Betrag: ${formatCurrency(a.amount)}</div>
    </div>
    `).join('')}
    ` : `
    <div style="background: #d1fae5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
      <div style="font-size: 24px; margin-bottom: 10px;">✅</div>
      <div style="color: #065f46; font-weight: 500;">Keine neuen Anomalien heute</div>
    </div>
    `}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.dashboardUrl}/anomalies"
         style="background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
        Zum Dashboard
      </a>
    </div>
  </div>

  <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">
      Diese E-Mail wurde automatisch von Cost Watchdog gesendet.<br>
      <a href="${data.dashboardUrl}/settings/notifications" style="color: #6b7280;">Benachrichtigungseinstellungen ändern</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send an anomaly alert email
 */
export async function sendAnomalyAlertEmail(data: AnomalyAlertEmailData): Promise<EmailResult> {
  if (!resend) {
    console.warn('[Email] Resend not configured, skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  const recipientList = Array.isArray(data.recipientEmail)
    ? data.recipientEmail
    : [data.recipientEmail];

  try {
    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to: data.recipientEmail,
      subject: `[${getSeverityLabel(data.severity)}] Kostenanomalie: ${data.message}`,
      html: generateAnomalyAlertHtml(data),
      text: generateAnomalyAlertText(data),
    });

    if (result.error) {
      console.error('[Email] Failed to send anomaly alert:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log(`[Email] Anomaly alert sent to ${recipientList.join(', ')}, messageId: ${result.data?.id}`);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Email] Error sending anomaly alert:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a daily digest email
 */
export async function sendDailyDigestEmail(data: DailyDigestEmailData): Promise<EmailResult> {
  if (!resend) {
    console.warn('[Email] Resend not configured, skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  const totalCount = data.criticalCount + data.warningCount + data.infoCount;

  try {
    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to: data.recipientEmail,
      subject: totalCount > 0
        ? `📊 Tägliche Zusammenfassung: ${totalCount} Anomalie${totalCount > 1 ? 'n' : ''} - ${data.date}`
        : `✅ Tägliche Zusammenfassung: Keine Anomalien - ${data.date}`,
      html: generateDailyDigestHtml(data),
    });

    if (result.error) {
      console.error('[Email] Failed to send daily digest:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log(`[Email] Daily digest sent to ${data.recipientEmail}, messageId: ${result.data?.id}`);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Email] Error sending daily digest:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return resend !== null;
}
