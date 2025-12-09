/**
 * Microsoft Teams integration for sending alert notifications via webhooks.
 * Uses Adaptive Cards for rich message formatting.
 */

/**
 * Adaptive Card element types
 */
export interface AdaptiveCardTextBlock {
  type: 'TextBlock';
  text: string;
  size?: 'Small' | 'Default' | 'Medium' | 'Large' | 'ExtraLarge';
  weight?: 'Default' | 'Lighter' | 'Bolder';
  color?: 'Default' | 'Dark' | 'Light' | 'Accent' | 'Good' | 'Warning' | 'Attention';
  wrap?: boolean;
  isSubtle?: boolean;
  spacing?: 'None' | 'Small' | 'Default' | 'Medium' | 'Large' | 'ExtraLarge';
}

export interface AdaptiveCardFactSet {
  type: 'FactSet';
  facts: Array<{
    title: string;
    value: string;
  }>;
}

export interface AdaptiveCardColumnSet {
  type: 'ColumnSet';
  columns: Array<{
    type: 'Column';
    width: string | number;
    items: AdaptiveCardElement[];
  }>;
}

export interface AdaptiveCardImage {
  type: 'Image';
  url: string;
  size?: 'Auto' | 'Stretch' | 'Small' | 'Medium' | 'Large';
  altText?: string;
}

export interface AdaptiveCardContainer {
  type: 'Container';
  style?: 'Default' | 'Emphasis' | 'Good' | 'Attention' | 'Warning' | 'Accent';
  items: AdaptiveCardElement[];
  padding?: 'None' | 'Small' | 'Default' | 'Medium' | 'Large' | 'ExtraLarge';
}

export interface AdaptiveCardActionOpenUrl {
  type: 'Action.OpenUrl';
  title: string;
  url: string;
}

export type AdaptiveCardElement =
  | AdaptiveCardTextBlock
  | AdaptiveCardFactSet
  | AdaptiveCardColumnSet
  | AdaptiveCardImage
  | AdaptiveCardContainer;

export type AdaptiveCardAction = AdaptiveCardActionOpenUrl;

/**
 * Adaptive Card structure
 */
export interface AdaptiveCard {
  type: 'AdaptiveCard';
  $schema: string;
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
  msteams?: {
    width: 'Full';
  };
}

/**
 * Teams webhook message payload
 */
export interface TeamsMessage {
  type: 'message';
  attachments: Array<{
    contentType: 'application/vnd.microsoft.card.adaptive';
    contentUrl: null;
    content: AdaptiveCard;
  }>;
}

/**
 * Anomaly alert data for Teams notification
 */
export interface TeamsAnomalyAlertData {
  webhookUrl: string;
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
 * Daily digest data for Teams notification
 */
export interface TeamsDigestData {
  webhookUrl: string;
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
 * Result of sending a Teams message
 */
export interface TeamsResult {
  success: boolean;
  error?: string;
}

/**
 * Get severity color for Teams card
 */
function getSeverityColor(severity: string): 'Good' | 'Warning' | 'Attention' | 'Default' {
  switch (severity) {
    case 'critical':
      return 'Attention';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Good';
    default:
      return 'Default';
  }
}

/**
 * Get severity text color
 */
function getSeverityTextColor(severity: string): 'Good' | 'Warning' | 'Attention' | 'Default' {
  switch (severity) {
    case 'critical':
      return 'Attention';
    case 'warning':
      return 'Warning';
    default:
      return 'Default';
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
 * Build Teams Adaptive Card for anomaly alert
 */
function buildAnomalyAlertCard(data: TeamsAnomalyAlertData): AdaptiveCard {
  const severityColor = getSeverityColor(data.severity);
  const textColor = getSeverityTextColor(data.severity);
  const severityLabel = getSeverityLabel(data.severity);

  const body: AdaptiveCardElement[] = [
    {
      type: 'Container',
      style: severityColor,
      padding: 'Default',
      items: [
        {
          type: 'TextBlock',
          text: '🔍 Cost Watchdog - Kostenanomalie erkannt',
          size: 'Medium',
          weight: 'Bolder',
          color: 'Default',
          wrap: true,
        },
      ],
    },
    {
      type: 'TextBlock',
      text: data.message,
      size: 'Large',
      weight: 'Bolder',
      wrap: true,
      spacing: 'Medium',
    },
    {
      type: 'ColumnSet',
      columns: [
        {
          type: 'Column',
          width: 'auto',
          items: [
            {
              type: 'TextBlock',
              text: severityLabel,
              color: textColor,
              weight: 'Bolder',
              size: 'Default',
            },
          ],
        },
      ],
    },
    {
      type: 'FactSet',
      facts: [
        { title: 'Kostenart', value: data.costType },
        { title: 'Lieferant', value: data.supplierName },
        { title: 'Standort', value: data.locationName },
        { title: 'Betrag', value: formatCurrency(data.amount) },
        { title: 'Zeitraum', value: `${data.periodStart} - ${data.periodEnd}` },
      ],
    },
  ];

  if (data.deviationPercent !== undefined) {
    const deviationFacts: AdaptiveCardFactSet = {
      type: 'FactSet',
      facts: [
        {
          title: 'Abweichung',
          value: `${data.deviationPercent > 0 ? '+' : ''}${data.deviationPercent.toFixed(1)}%`,
        },
      ],
    };
    if (data.expectedAmount !== undefined) {
      deviationFacts.facts.push({ title: 'Erwartet', value: formatCurrency(data.expectedAmount) });
    }
    body.push(deviationFacts);
  }

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    msteams: { width: 'Full' },
    body,
    actions: [
      {
        type: 'Action.OpenUrl',
        title: 'Im Dashboard ansehen',
        url: `${data.dashboardUrl}/anomalies/${data.anomalyId}`,
      },
    ],
  };
}

/**
 * Build Teams Adaptive Card for daily digest
 */
function buildDigestCard(data: TeamsDigestData): AdaptiveCard {
  const totalCount = data.criticalCount + data.warningCount + data.infoCount;

  const body: AdaptiveCardElement[] = [
    {
      type: 'Container',
      style: 'Emphasis',
      padding: 'Default',
      items: [
        {
          type: 'TextBlock',
          text: `📊 Cost Watchdog - Tägliche Zusammenfassung`,
          size: 'Medium',
          weight: 'Bolder',
          wrap: true,
        },
        {
          type: 'TextBlock',
          text: data.date,
          isSubtle: true,
          spacing: 'None',
        },
      ],
    },
    {
      type: 'ColumnSet',
      columns: [
        {
          type: 'Column',
          width: 'stretch',
          items: [
            {
              type: 'TextBlock',
              text: String(data.criticalCount),
              size: 'ExtraLarge',
              weight: 'Bolder',
              color: 'Attention',
            },
            {
              type: 'TextBlock',
              text: 'Kritisch',
              spacing: 'None',
              isSubtle: true,
            },
          ],
        },
        {
          type: 'Column',
          width: 'stretch',
          items: [
            {
              type: 'TextBlock',
              text: String(data.warningCount),
              size: 'ExtraLarge',
              weight: 'Bolder',
              color: 'Warning',
            },
            {
              type: 'TextBlock',
              text: 'Warnungen',
              spacing: 'None',
              isSubtle: true,
            },
          ],
        },
        {
          type: 'Column',
          width: 'stretch',
          items: [
            {
              type: 'TextBlock',
              text: String(data.infoCount),
              size: 'ExtraLarge',
              weight: 'Bolder',
              color: 'Good',
            },
            {
              type: 'TextBlock',
              text: 'Info',
              spacing: 'None',
              isSubtle: true,
            },
          ],
        },
      ],
    },
  ];

  if (totalCount > 0 && data.topAnomalies.length > 0) {
    body.push({
      type: 'TextBlock',
      text: 'Top Anomalien',
      weight: 'Bolder',
      spacing: 'Large',
    });

    for (const anomaly of data.topAnomalies.slice(0, 5)) {
      const color = getSeverityTextColor(anomaly.severity);
      body.push({
        type: 'Container',
        style: 'Default',
        items: [
          {
            type: 'TextBlock',
            text: anomaly.message,
            wrap: true,
            color,
          },
          {
            type: 'TextBlock',
            text: `Betrag: ${formatCurrency(anomaly.amount)}`,
            isSubtle: true,
            spacing: 'None',
            size: 'Small',
          },
        ],
      });
    }
  } else {
    body.push({
      type: 'Container',
      style: 'Good',
      padding: 'Default',
      items: [
        {
          type: 'TextBlock',
          text: '✅ Keine neuen Anomalien heute!',
          weight: 'Bolder',
          wrap: true,
        },
      ],
    });
  }

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    msteams: { width: 'Full' },
    body,
    actions: [
      {
        type: 'Action.OpenUrl',
        title: 'Zum Dashboard',
        url: `${data.dashboardUrl}/anomalies`,
      },
    ],
  };
}

// Allowed Teams webhook host patterns for SSRF protection
const ALLOWED_TEAMS_HOST_SUFFIXES = ['.webhook.office.com', '.logic.azure.com'];

// Request timeout in milliseconds
const WEBHOOK_TIMEOUT_MS = 10000;

/**
 * Validate webhook URL against allowed hosts (SSRF protection)
 */
function isAllowedTeamsHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_TEAMS_HOST_SUFFIXES.some(suffix => parsed.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

/**
 * Send a message to Teams via webhook
 */
async function sendWebhook(webhookUrl: string, card: AdaptiveCard): Promise<TeamsResult> {
  // Validate webhook URL against allowed hosts (SSRF protection)
  if (!isAllowedTeamsHost(webhookUrl)) {
    console.error('[Teams] Rejected webhook URL - not an allowed Teams host:', webhookUrl);
    return { success: false, error: 'Invalid Teams webhook URL: must be https://*.webhook.office.com or https://*.logic.azure.com' };
  }

  const message: TeamsMessage = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: card,
      },
    ],
  };

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
      console.error('[Teams] Webhook failed:', response.status, errorText);
      return { success: false, error: `Teams webhook failed: ${response.status} ${errorText}` };
    }

    console.log('[Teams] Message sent successfully');
    return { success: true };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Teams] Request timed out after', WEBHOOK_TIMEOUT_MS, 'ms');
      return { success: false, error: `Teams webhook timed out after ${WEBHOOK_TIMEOUT_MS}ms` };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Teams] Error sending webhook:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send an anomaly alert to Teams
 */
export async function sendTeamsAnomalyAlert(data: TeamsAnomalyAlertData): Promise<TeamsResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Teams webhook URL not configured' };
  }

  const card = buildAnomalyAlertCard(data);
  return sendWebhook(data.webhookUrl, card);
}

/**
 * Send a daily digest to Teams
 */
export async function sendTeamsDailyDigest(data: TeamsDigestData): Promise<TeamsResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Teams webhook URL not configured' };
  }

  const card = buildDigestCard(data);
  return sendWebhook(data.webhookUrl, card);
}

/**
 * Test Teams webhook connection
 */
export async function testTeamsWebhook(webhookUrl: string): Promise<TeamsResult> {
  const testCard: AdaptiveCard = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    msteams: { width: 'Full' },
    body: [
      {
        type: 'Container',
        style: 'Good',
        padding: 'Default',
        items: [
          {
            type: 'TextBlock',
            text: '✅ Cost Watchdog Verbindungstest',
            size: 'Medium',
            weight: 'Bolder',
            wrap: true,
          },
          {
            type: 'TextBlock',
            text: 'Die Microsoft Teams-Integration wurde erfolgreich konfiguriert. Sie werden hier Benachrichtigungen über Kostenanomalien erhalten.',
            wrap: true,
            spacing: 'Small',
          },
        ],
      },
    ],
  };

  return sendWebhook(webhookUrl, testCard);
}

/**
 * Validate Teams webhook URL format
 */
export function isValidTeamsWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.webhook.office.com') ||
        parsed.hostname.endsWith('.logic.azure.com'))
    );
  } catch {
    return false;
  }
}
