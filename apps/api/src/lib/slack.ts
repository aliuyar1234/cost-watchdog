/**
 * Slack integration for sending alert notifications via webhooks.
 * Supports both incoming webhooks and Slack API tokens.
 */

/**
 * Slack message attachment for rich formatting
 */
export interface SlackAttachment {
  color?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  footer?: string;
  ts?: number;
}

/**
 * Slack message block for Block Kit
 */
export interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context' | 'actions';
  text?: {
    type: 'plain_text' | 'mrkdwn';
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: 'plain_text' | 'mrkdwn';
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text?: { type: string; text: string; emoji?: boolean };
    url?: string;
    action_id?: string;
  }>;
  accessory?: {
    type: string;
    text?: { type: string; text: string; emoji?: boolean };
    url?: string;
  };
}

/**
 * Slack webhook message payload
 */
export interface SlackMessage {
  text?: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
}

/**
 * Anomaly alert data for Slack notification
 */
export interface SlackAnomalyAlertData {
  webhookUrl: string;
  channel?: string;
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
 * Daily digest data for Slack notification
 */
export interface SlackDigestData {
  webhookUrl: string;
  channel?: string;
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
 * Result of sending a Slack message
 */
export interface SlackResult {
  success: boolean;
  error?: string;
}

/**
 * Get severity color for Slack attachment
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#dc2626'; // red
    case 'warning':
      return '#f59e0b'; // amber
    default:
      return '#3b82f6'; // blue
  }
}

/**
 * Get severity emoji
 */
function getSeverityEmoji(severity: string): string {
  switch (severity) {
    case 'critical':
      return ':rotating_light:';
    case 'warning':
      return ':warning:';
    default:
      return ':information_source:';
  }
}

/**
 * Get German severity label
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
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Build Slack message for anomaly alert using Block Kit
 */
function buildAnomalyAlertMessage(data: SlackAnomalyAlertData): SlackMessage {
  const emoji = getSeverityEmoji(data.severity);
  const color = getSeverityColor(data.severity);
  const severityLabel = getSeverityLabel(data.severity);

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} Kostenanomalie erkannt`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${data.message}*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Schweregrad:*\n${severityLabel}`,
        },
        {
          type: 'mrkdwn',
          text: `*Kostenart:*\n${data.costType}`,
        },
        {
          type: 'mrkdwn',
          text: `*Lieferant:*\n${data.supplierName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Standort:*\n${data.locationName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Betrag:*\n${formatCurrency(data.amount)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Zeitraum:*\n${data.periodStart} - ${data.periodEnd}`,
        },
      ],
    },
  ];

  if (data.deviationPercent !== undefined) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Abweichung:* ${data.deviationPercent > 0 ? '+' : ''}${data.deviationPercent.toFixed(1)}%${data.expectedAmount ? ` (erwartet: ${formatCurrency(data.expectedAmount)})` : ''}`,
      },
    });
  }

  blocks.push(
    {
      type: 'divider',
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Im Dashboard ansehen',
            emoji: true,
          },
          url: `${data.dashboardUrl}/anomalies/${data.anomalyId}`,
          action_id: 'view_anomaly',
        },
      ],
    }
  );

  return {
    text: `${emoji} ${severityLabel}: ${data.message}`,
    channel: data.channel,
    username: 'Cost Watchdog',
    icon_emoji: ':dog:',
    blocks,
    attachments: [
      {
        color,
        footer: 'Cost Watchdog',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

/**
 * Build Slack message for daily digest using Block Kit
 */
function buildDigestMessage(data: SlackDigestData): SlackMessage {
  const totalCount = data.criticalCount + data.warningCount + data.infoCount;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `:chart_with_upwards_trend: Tägliche Zusammenfassung - ${data.date}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `:rotating_light: *Kritisch:* ${data.criticalCount}`,
        },
        {
          type: 'mrkdwn',
          text: `:warning: *Warnungen:* ${data.warningCount}`,
        },
        {
          type: 'mrkdwn',
          text: `:information_source: *Info:* ${data.infoCount}`,
        },
        {
          type: 'mrkdwn',
          text: `:bar_chart: *Gesamt:* ${totalCount}`,
        },
      ],
    },
  ];

  if (totalCount > 0 && data.topAnomalies.length > 0) {
    blocks.push({
      type: 'divider',
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Top Anomalien:*',
      },
    });

    for (const anomaly of data.topAnomalies.slice(0, 5)) {
      const emoji = getSeverityEmoji(anomaly.severity);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} ${anomaly.message}\n_Betrag: ${formatCurrency(anomaly.amount)}_`,
        },
      });
    }
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':white_check_mark: *Keine neuen Anomalien heute!*',
      },
    });
  }

  blocks.push(
    {
      type: 'divider',
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Zum Dashboard',
            emoji: true,
          },
          url: `${data.dashboardUrl}/anomalies`,
          action_id: 'view_dashboard',
        },
      ],
    }
  );

  return {
    text: totalCount > 0
      ? `:chart_with_upwards_trend: Tägliche Zusammenfassung: ${totalCount} Anomalie${totalCount !== 1 ? 'n' : ''}`
      : ':white_check_mark: Tägliche Zusammenfassung: Keine Anomalien',
    channel: data.channel,
    username: 'Cost Watchdog',
    icon_emoji: ':dog:',
    blocks,
  };
}

// Allowed Slack webhook hosts for security
const ALLOWED_SLACK_HOSTS = ['hooks.slack.com'];

// Request timeout in milliseconds
const WEBHOOK_TIMEOUT_MS = 10000;

/**
 * Validate webhook URL against allowed hosts
 */
function isAllowedSlackHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_SLACK_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Send a message to Slack via webhook
 */
async function sendWebhook(webhookUrl: string, message: SlackMessage): Promise<SlackResult> {
  // Validate webhook URL against allowed hosts (SSRF protection)
  if (!isAllowedSlackHost(webhookUrl)) {
    console.error('[Slack] Rejected webhook URL - not an allowed Slack host:', webhookUrl);
    return { success: false, error: 'Invalid Slack webhook URL: must be https://hooks.slack.com' };
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Slack] Webhook failed:', response.status, errorText);
      return { success: false, error: `Slack webhook failed: ${response.status} ${errorText}` };
    }

    console.log('[Slack] Message sent successfully');
    return { success: true };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Slack] Request timed out after', WEBHOOK_TIMEOUT_MS, 'ms');
      return { success: false, error: `Slack webhook timed out after ${WEBHOOK_TIMEOUT_MS}ms` };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Slack] Error sending webhook:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send an anomaly alert to Slack
 */
export async function sendSlackAnomalyAlert(data: SlackAnomalyAlertData): Promise<SlackResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Slack webhook URL not configured' };
  }

  const message = buildAnomalyAlertMessage(data);
  return sendWebhook(data.webhookUrl, message);
}

/**
 * Send a daily digest to Slack
 */
export async function sendSlackDailyDigest(data: SlackDigestData): Promise<SlackResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Slack webhook URL not configured' };
  }

  const message = buildDigestMessage(data);
  return sendWebhook(data.webhookUrl, message);
}

/**
 * Test Slack webhook connection
 */
export async function testSlackWebhook(webhookUrl: string): Promise<SlackResult> {
  const testMessage: SlackMessage = {
    text: ':white_check_mark: Cost Watchdog Verbindungstest erfolgreich!',
    username: 'Cost Watchdog',
    icon_emoji: ':dog:',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':white_check_mark: *Cost Watchdog Verbindungstest*\n\nDie Slack-Integration wurde erfolgreich konfiguriert. Sie werden hier Benachrichtigungen über Kostenanomalien erhalten.',
        },
      },
    ],
  };

  return sendWebhook(webhookUrl, testMessage);
}

/**
 * Validate Slack webhook URL format
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'hooks.slack.com' &&
      parsed.pathname.startsWith('/services/')
    );
  } catch {
    return false;
  }
}
