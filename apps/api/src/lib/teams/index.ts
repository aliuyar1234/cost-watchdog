import { buildAnomalyAlertCard, buildDigestCard, buildTeamsTestCard } from './cards.js';
import { isValidTeamsWebhookUrl, sendTeamsWebhook } from './webhook.js';
import type { TeamsAnomalyAlertData, TeamsDigestData, TeamsResult } from './types.js';

export type {
  AdaptiveCard,
  AdaptiveCardAction,
  AdaptiveCardActionOpenUrl,
  AdaptiveCardColumnSet,
  AdaptiveCardContainer,
  AdaptiveCardElement,
  AdaptiveCardFactSet,
  AdaptiveCardImage,
  AdaptiveCardTextBlock,
  TeamsAnomalyAlertData,
  TeamsDigestData,
  TeamsMessage,
  TeamsResult,
} from './types.js';

export { isValidTeamsWebhookUrl };

export async function sendTeamsAnomalyAlert(data: TeamsAnomalyAlertData): Promise<TeamsResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Teams webhook URL not configured' };
  }

  const card = buildAnomalyAlertCard(data);
  return sendTeamsWebhook(data.webhookUrl, card);
}

export async function sendTeamsDailyDigest(data: TeamsDigestData): Promise<TeamsResult> {
  if (!data.webhookUrl) {
    return { success: false, error: 'Teams webhook URL not configured' };
  }

  const card = buildDigestCard(data);
  return sendTeamsWebhook(data.webhookUrl, card);
}

export async function testTeamsWebhook(webhookUrl: string): Promise<TeamsResult> {
  return sendTeamsWebhook(webhookUrl, buildTeamsTestCard());
}
