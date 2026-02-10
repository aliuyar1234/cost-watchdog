import type { AdaptiveCard, TeamsMessage, TeamsResult } from './types.js';

const ALLOWED_TEAMS_HOST_SUFFIXES = ['.webhook.office.com', '.logic.azure.com'];
const WEBHOOK_TIMEOUT_MS = 10000;

function isAllowedTeamsHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_TEAMS_HOST_SUFFIXES.some((suffix) => parsed.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

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

export async function sendTeamsWebhook(
  webhookUrl: string,
  card: AdaptiveCard,
): Promise<TeamsResult> {
  if (!isAllowedTeamsHost(webhookUrl)) {
    console.error('[Teams] Rejected webhook URL - not an allowed Teams host:', webhookUrl);
    return {
      success: false,
      error:
        'Invalid Teams webhook URL: must be https://*.webhook.office.com or https://*.logic.azure.com',
    };
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
