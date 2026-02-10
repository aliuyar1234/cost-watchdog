import { buildAnomalyAlertMessage, buildDigestMessage, buildSlackTestMessage } from './messages.js';
import { isValidSlackWebhookUrl, sendSlackWebhook } from './webhook.js';
import type { SlackAnomalyAlertData, SlackDigestData, SlackResult } from './types.js';

export type {
  SlackAnomalyAlertData,
  SlackAttachment,
  SlackBlock,
  SlackDigestData,
  SlackMessage,
  SlackResult,
} from './types.js';

export { isValidSlackWebhookUrl };

export async function sendSlackAnomalyAlert(data: SlackAnomalyAlertData): Promise<SlackResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Slack webhook URL not configured' };
  }

  return sendSlackWebhook(data.webhookUrl, buildAnomalyAlertMessage(data));
}

export async function sendSlackDailyDigest(data: SlackDigestData): Promise<SlackResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Slack webhook URL not configured' };
  }

  return sendSlackWebhook(data.webhookUrl, buildDigestMessage(data));
}

export async function testSlackWebhook(webhookUrl: string): Promise<SlackResult> {
  return sendSlackWebhook(webhookUrl, buildSlackTestMessage());
}
