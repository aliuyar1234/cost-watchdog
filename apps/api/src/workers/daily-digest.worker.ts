import { loadAlertSettings } from '../lib/alert-settings.js';
import { loadAppTimezone } from '../lib/app-settings.js';
import {
  parseDailyDigestTime,
  getDigestWindow,
  getScheduledTimeForDate,
} from '../lib/digest-time.js';
import { sendDailyDigestEmail, isEmailConfigured } from '../lib/email.js';
import { sendSlackDailyDigest } from '../lib/slack.js';
import { sendTeamsDailyDigest } from '../lib/teams.js';
import { DASHBOARD_URL, DEFAULT_DAILY_DIGEST_CONFIG } from './daily-digest/config.js';
import { claimDigestRecord, markDigestFailed, markDigestSent } from './daily-digest/records.js';
import { getRecipientName, loadEmailRecipients } from './daily-digest/recipients.js';
import { buildDigestSummary, getEnabledSeverities } from './daily-digest/summary.js';
import type { DailyDigestWorkerConfig, DigestSummary } from './daily-digest/types.js';

export class DailyDigestWorker {
  private config: Required<DailyDigestWorkerConfig>;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private inProgress = false;

  constructor(config: DailyDigestWorkerConfig = {}) {
    this.config = { ...DEFAULT_DAILY_DIGEST_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[DailyDigestWorker] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[DailyDigestWorker] Started (poll ${this.config.pollIntervalMs}ms)`);

    if (this.config.runOnStartup) {
      await this.tick();
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[DailyDigestWorker] Stopped');
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.inProgress) {
      return;
    }

    this.inProgress = true;

    try {
      const settings = await loadAlertSettings();
      if (!settings.dailyDigestEnabled) {
        return;
      }

      const digestTime = parseDailyDigestTime(settings.dailyDigestTime);
      if (!digestTime) {
        console.warn(
          '[DailyDigestWorker] Invalid dailyDigestTime setting:',
          settings.dailyDigestTime,
        );
        return;
      }

      const timeZone = await loadAppTimezone();
      const now = new Date();
      const scheduledTime = getScheduledTimeForDate(now, digestTime, timeZone);
      if (now < scheduledTime) {
        return;
      }

      const { digestKey, windowStart, windowEnd } = getDigestWindow(now, digestTime, timeZone);
      const enabledSeverities = getEnabledSeverities(settings);
      const summary = await buildDigestSummary(windowStart, windowEnd, enabledSeverities);

      await this.sendDigest({
        digestKey,
        windowStart,
        windowEnd,
        summary,
        settings,
      });
    } catch (error) {
      console.error('[DailyDigestWorker] Digest run failed:', error);
    } finally {
      this.inProgress = false;
    }
  }

  private async sendDigest(params: {
    digestKey: string;
    windowStart: Date;
    windowEnd: Date;
    summary: DigestSummary;
    settings: Awaited<ReturnType<typeof loadAlertSettings>>;
  }): Promise<void> {
    const slackWebhookUrl = params.settings.slackWebhookUrl.trim();
    const teamsWebhookUrl = params.settings.teamsWebhookUrl.trim();

    if (
      !params.settings.emailEnabled &&
      !params.settings.slackEnabled &&
      !params.settings.teamsEnabled
    ) {
      console.log('[DailyDigestWorker] No alert channels enabled, skipping digest');
      return;
    }

    if (params.settings.emailEnabled) {
      const recipients = await loadEmailRecipients();
      if (recipients.length === 0) {
        console.log('[DailyDigestWorker] No email recipients found, skipping email digest');
      } else if (!isEmailConfigured()) {
        console.warn('[DailyDigestWorker] Email service not configured, skipping email digest');
      } else {
        for (const recipient of recipients) {
          const record = await claimDigestRecord({
            digestKey: params.digestKey,
            channel: 'email',
            recipient: recipient.email,
            userId: recipient.id,
            windowStart: params.windowStart,
            windowEnd: params.windowEnd,
            maxAttempts: this.config.maxAttempts,
          });

          if (!record) {
            continue;
          }

          const result = await sendDailyDigestEmail({
            recipientEmail: recipient.email,
            recipientName: getRecipientName(
              recipient.firstName,
              recipient.lastName,
              recipient.email,
            ),
            ...params.summary,
            dashboardUrl: DASHBOARD_URL,
          });

          if (result.success) {
            await markDigestSent(record.id);
          } else {
            await markDigestFailed(record.id, result.error || 'Email digest failed');
          }
        }
      }
    }

    if (params.settings.slackEnabled && slackWebhookUrl) {
      const record = await claimDigestRecord({
        digestKey: params.digestKey,
        channel: 'slack',
        recipient: slackWebhookUrl,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        maxAttempts: this.config.maxAttempts,
      });

      if (record) {
        const result = await sendSlackDailyDigest({
          webhookUrl: slackWebhookUrl,
          ...params.summary,
          dashboardUrl: DASHBOARD_URL,
        });

        if (result.success) {
          await markDigestSent(record.id);
        } else {
          await markDigestFailed(record.id, result.error || 'Slack digest failed');
        }
      }
    }

    if (params.settings.teamsEnabled && teamsWebhookUrl) {
      const record = await claimDigestRecord({
        digestKey: params.digestKey,
        channel: 'teams',
        recipient: teamsWebhookUrl,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        maxAttempts: this.config.maxAttempts,
      });

      if (record) {
        const result = await sendTeamsDailyDigest({
          webhookUrl: teamsWebhookUrl,
          ...params.summary,
          dashboardUrl: DASHBOARD_URL,
        });

        if (result.success) {
          await markDigestSent(record.id);
        } else {
          await markDigestFailed(record.id, result.error || 'Teams digest failed');
        }
      }
    }
  }
}

export function createDailyDigestWorker(config?: DailyDigestWorkerConfig): DailyDigestWorker {
  return new DailyDigestWorker(config);
}
