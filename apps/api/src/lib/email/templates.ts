import { sanitizeString, sanitizeUrl } from '../sanitize.js';
import { formatCurrency, getSeverityColor, getSeverityLabel } from './formatting.js';
import type { AnomalyAlertEmailData, DailyDigestEmailData } from './types.js';

export function generateAnomalyAlertHtml(data: AnomalyAlertEmailData): string {
  const severityColor = getSeverityColor(data.severity);
  const severityLabel = getSeverityLabel(data.severity);
  const safeRecipientName = sanitizeString(data.recipientName);
  const safeMessage = sanitizeString(data.message);
  const safeSupplierName = sanitizeString(data.supplierName);
  const safeLocationName = sanitizeString(data.locationName);
  const safeCostType = sanitizeString(data.costType);
  const safePeriodStart = sanitizeString(data.periodStart);
  const safePeriodEnd = sanitizeString(data.periodEnd);
  const dashboardUrl = sanitizeUrl(data.dashboardUrl);
  const anomalyUrl = dashboardUrl
    ? sanitizeUrl(
        `${dashboardUrl.replace(/\/$/, '')}/anomalies/${encodeURIComponent(data.anomalyId)}`,
      )
    : '';
  const notificationsUrl = dashboardUrl
    ? sanitizeUrl(`${dashboardUrl.replace(/\/$/, '')}/settings/notifications`)
    : '';

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
    <h1 style="color: white; margin: 0; font-size: 24px;">Cost Watchdog</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Kostenanomalie erkannt</p>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hallo ${safeRecipientName},</p>

    <p>wir haben eine Anomalie in Ihren Kostendaten erkannt:</p>

    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid ${severityColor};">
      <div style="display: flex; align-items: center; margin-bottom: 15px;">
        <span style="background: ${severityColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
          ${severityLabel}
        </span>
      </div>

      <h3 style="margin: 0 0 10px 0; color: #1f2937;">${safeMessage}</h3>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Lieferant:</td>
          <td style="padding: 8px 0; font-weight: 500;">${safeSupplierName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Standort:</td>
          <td style="padding: 8px 0; font-weight: 500;">${safeLocationName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Kostenart:</td>
          <td style="padding: 8px 0; font-weight: 500;">${safeCostType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Betrag:</td>
          <td style="padding: 8px 0; font-weight: 600; color: ${severityColor};">${formatCurrency(data.amount)}</td>
        </tr>
        ${
          data.expectedAmount
            ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Erwartet:</td>
          <td style="padding: 8px 0;">${formatCurrency(data.expectedAmount)}</td>
        </tr>
        `
            : ''
        }
        ${
          data.deviationPercent
            ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Abweichung:</td>
          <td style="padding: 8px 0; font-weight: 500; color: ${severityColor};">${data.deviationPercent > 0 ? '+' : ''}${data.deviationPercent.toFixed(1)}%</td>
        </tr>
        `
            : ''
        }
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Zeitraum:</td>
          <td style="padding: 8px 0;">${safePeriodStart} - ${safePeriodEnd}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${anomalyUrl || '#'}"
         style="background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
        Anomalie pruefen
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
      Sie koennen diese Anomalie im Dashboard bestaetigen, ablehnen oder als Fehlalarm markieren.
    </p>
  </div>

  <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">
      Diese E-Mail wurde automatisch von Cost Watchdog gesendet.<br>
      <a href="${notificationsUrl || '#'}" style="color: #6b7280;">Benachrichtigungseinstellungen aendern</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}

export function generateAnomalyAlertText(data: AnomalyAlertEmailData): string {
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

Anomalie pruefen: ${data.dashboardUrl}/anomalies/${data.anomalyId}

---
Diese E-Mail wurde automatisch von Cost Watchdog gesendet.
Benachrichtigungseinstellungen: ${data.dashboardUrl}/settings/notifications
  `.trim();
}

export function generateDailyDigestHtml(data: DailyDigestEmailData): string {
  const totalCount = data.criticalCount + data.warningCount + data.infoCount;
  const safeRecipientName = sanitizeString(data.recipientName);
  const safeDate = sanitizeString(data.date);
  const dashboardUrl = sanitizeUrl(data.dashboardUrl);
  const anomaliesUrl = dashboardUrl
    ? sanitizeUrl(`${dashboardUrl.replace(/\/$/, '')}/anomalies`)
    : '';
  const notificationsUrl = dashboardUrl
    ? sanitizeUrl(`${dashboardUrl.replace(/\/$/, '')}/settings/notifications`)
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Taegliche Zusammenfassung</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Cost Watchdog</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Taegliche Zusammenfassung - ${safeDate}</p>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hallo ${safeRecipientName},</p>

    <p>hier ist Ihre taegliche Zusammenfassung der Kostenanomalien:</p>

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

    ${
      totalCount > 0
        ? `
    <h3 style="margin: 25px 0 15px 0; font-size: 16px;">Top Anomalien</h3>
    ${data.topAnomalies
      .map(
        (anomaly) => `
    <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid ${getSeverityColor(anomaly.severity)};">
      <div style="font-weight: 500;">${sanitizeString(anomaly.message)}</div>
      <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">Betrag: ${formatCurrency(anomaly.amount)}</div>
    </div>
    `,
      )
      .join('')}
    `
        : `
    <div style="background: #d1fae5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
      <div style="font-size: 24px; margin-bottom: 10px;">OK</div>
      <div style="color: #065f46; font-weight: 500;">Keine neuen Anomalien heute</div>
    </div>
    `
    }

    <div style="text-align: center; margin: 30px 0;">
      <a href="${anomaliesUrl || '#'}"
         style="background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
        Zum Dashboard
      </a>
    </div>
  </div>

  <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">
      Diese E-Mail wurde automatisch von Cost Watchdog gesendet.<br>
      <a href="${notificationsUrl || '#'}" style="color: #6b7280;">Benachrichtigungseinstellungen aendern</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}
