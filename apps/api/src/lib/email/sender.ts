import { EMAIL_CONFIG, resendClient } from './config.js';
import { getSeverityLabel } from './formatting.js';
import {
  generateAnomalyAlertHtml,
  generateAnomalyAlertText,
  generateDailyDigestHtml,
} from './templates.js';
import type { AnomalyAlertEmailData, DailyDigestEmailData, EmailResult } from './types.js';

export async function sendAnomalyAlertEmail(data: AnomalyAlertEmailData): Promise<EmailResult> {
  if (!resendClient) {
    console.warn('[Email] Resend not configured, skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  const recipientList = Array.isArray(data.recipientEmail)
    ? data.recipientEmail
    : [data.recipientEmail];

  try {
    const result = await resendClient.emails.send({
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

    console.log(
      `[Email] Anomaly alert sent to ${recipientList.join(', ')}, messageId: ${result.data?.id}`,
    );
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Email] Error sending anomaly alert:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function sendDailyDigestEmail(data: DailyDigestEmailData): Promise<EmailResult> {
  if (!resendClient) {
    console.warn('[Email] Resend not configured, skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  const totalCount = data.criticalCount + data.warningCount + data.infoCount;
  const anomalySuffix = totalCount > 1 ? 'n' : '';
  const subject =
    totalCount > 0
      ? `Taegliche Zusammenfassung: ${totalCount} Anomalie${anomalySuffix} - ${data.date}`
      : `Taegliche Zusammenfassung: Keine Anomalien - ${data.date}`;

  try {
    const result = await resendClient.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to: data.recipientEmail,
      subject,
      html: generateDailyDigestHtml(data),
    });

    if (result.error) {
      console.error('[Email] Failed to send daily digest:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log(
      `[Email] Daily digest sent to ${data.recipientEmail}, messageId: ${result.data?.id}`,
    );
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Email] Error sending daily digest:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export function isEmailConfigured(): boolean {
  return resendClient !== null;
}
