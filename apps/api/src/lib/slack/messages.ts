import type { SlackAnomalyAlertData, SlackBlock, SlackDigestData, SlackMessage } from './types.js';

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#dc2626';
    case 'warning':
      return '#f59e0b';
    default:
      return '#3b82f6';
  }
}

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export function buildAnomalyAlertMessage(data: SlackAnomalyAlertData): SlackMessage {
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
    },
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

export function buildDigestMessage(data: SlackDigestData): SlackMessage {
  const totalCount = data.criticalCount + data.warningCount + data.infoCount;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `:chart_with_upwards_trend: Taegliche Zusammenfassung - ${data.date}`,
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
    blocks.push({ type: 'divider' });

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
    { type: 'divider' },
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
    },
  );

  return {
    text:
      totalCount > 0
        ? `:chart_with_upwards_trend: Taegliche Zusammenfassung: ${totalCount} Anomalie${totalCount !== 1 ? 'n' : ''}`
        : ':white_check_mark: Taegliche Zusammenfassung: Keine Anomalien',
    channel: data.channel,
    username: 'Cost Watchdog',
    icon_emoji: ':dog:',
    blocks,
  };
}

export function buildSlackTestMessage(): SlackMessage {
  return {
    text: ':white_check_mark: Cost Watchdog Verbindungstest erfolgreich!',
    username: 'Cost Watchdog',
    icon_emoji: ':dog:',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':white_check_mark: *Cost Watchdog Verbindungstest*\n\nDie Slack-Integration wurde erfolgreich konfiguriert. Sie werden hier Benachrichtigungen ueber Kostenanomalien erhalten.',
        },
      },
    ],
  };
}
