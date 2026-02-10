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

export interface SlackMessage {
  text?: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
}

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

export interface SlackResult {
  success: boolean;
  error?: string;
}
