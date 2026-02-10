import type { SlackMessage, SlackResult } from './types.js';

const ALLOWED_SLACK_HOSTS = ['hooks.slack.com'];
const WEBHOOK_TIMEOUT_MS = 10000;

function isAllowedSlackHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_SLACK_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

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

export async function sendSlackWebhook(
  webhookUrl: string,
  message: SlackMessage,
): Promise<SlackResult> {
  if (!isAllowedSlackHost(webhookUrl)) {
    console.error('[Slack] Rejected webhook URL - not an allowed Slack host:', webhookUrl);
    return { success: false, error: 'Invalid Slack webhook URL: must be https://hooks.slack.com' };
  }

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
