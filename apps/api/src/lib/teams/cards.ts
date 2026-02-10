import type {
  AdaptiveCard,
  AdaptiveCardElement,
  AdaptiveCardFactSet,
  TeamsAnomalyAlertData,
  TeamsDigestData,
} from './types.js';

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

export function buildAnomalyAlertCard(data: TeamsAnomalyAlertData): AdaptiveCard {
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
          text: 'Cost Watchdog - Kostenanomalie erkannt',
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

export function buildDigestCard(data: TeamsDigestData): AdaptiveCard {
  const totalCount = data.criticalCount + data.warningCount + data.infoCount;

  const body: AdaptiveCardElement[] = [
    {
      type: 'Container',
      style: 'Emphasis',
      padding: 'Default',
      items: [
        {
          type: 'TextBlock',
          text: 'Cost Watchdog - Taegliche Zusammenfassung',
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
          text: 'Keine neuen Anomalien heute!',
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

export function buildTeamsTestCard(): AdaptiveCard {
  return {
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
            text: 'Cost Watchdog Verbindungstest',
            size: 'Medium',
            weight: 'Bolder',
            wrap: true,
          },
          {
            type: 'TextBlock',
            text: 'Die Microsoft Teams-Integration wurde erfolgreich konfiguriert. Sie werden hier Benachrichtigungen ueber Kostenanomalien erhalten.',
            wrap: true,
            spacing: 'Small',
          },
        ],
      },
    ],
  };
}
