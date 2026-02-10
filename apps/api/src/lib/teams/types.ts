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

export interface TeamsMessage {
  type: 'message';
  attachments: Array<{
    contentType: 'application/vnd.microsoft.card.adaptive';
    contentUrl: null;
    content: AdaptiveCard;
  }>;
}

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

export interface TeamsResult {
  success: boolean;
  error?: string;
}
