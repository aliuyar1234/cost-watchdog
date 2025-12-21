import { prisma } from '../lib/db.js';
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
import { resolveUserNotificationSettings } from '../lib/notification-settings.js';

const DASHBOARD_URL = process.env['WEB_URL'] || 'http://localhost:3000';

export interface DailyDigestWorkerConfig {
  pollIntervalMs?: number;
  maxAttempts?: number;
  runOnStartup?: boolean;
}

function parseEnvNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_CONFIG: Required<DailyDigestWorkerConfig> = {
  pollIntervalMs: parseEnvNumber(process.env['DAILY_DIGEST_POLL_INTERVAL_MS'], 60000),
  maxAttempts: parseEnvNumber(process.env['DAILY_DIGEST_MAX_ATTEMPTS'], 3),
  runOnStartup: process.env['DAILY_DIGEST_RUN_ON_STARTUP'] === 'true',
};

const RECIPIENT_CACHE_TTL_MS = 60 * 1000;
let cachedRecipients:
  | Array<{ id: string; email: string; firstName: string | null; lastName: string | null }>
  | null = null;
let cachedRecipientsAt = 0;

interface DigestSummary {
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
}

function formatDigestDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getRecipientName(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && firstName.trim()) {
    return firstName.trim();
  }
  if (lastName && lastName.trim()) {
    return lastName.trim();
  }
  return email.split('@')[0] || 'User';
}

function getEnabledSeverities(settings: {
  notifyOnCritical: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
}): string[] {
  const severities: string[] = [];
  if (settings.notifyOnCritical) severities.push('critical');
  if (settings.notifyOnWarning) severities.push('warning');
  if (settings.notifyOnInfo) severities.push('info');
  return severities;
}

async function loadEmailRecipients(): Promise<
  Array<{ id: string; email: string; firstName: string | null; lastName: string | null }>
> {
  const now = Date.now();
  if (cachedRecipients && now - cachedRecipientsAt < RECIPIENT_CACHE_TTL_MS) {
    return cachedRecipients;
  }

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['admin', 'manager'] },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      notificationSettings: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const filtered = recipients.filter((user) => {
    const settings = resolveUserNotificationSettings(user.notificationSettings);
    return settings.dailyDigestEnabled;
  });

  cachedRecipients = filtered.map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  }));
  cachedRecipientsAt = now;
  return cachedRecipients;
}

async function buildDigestSummary(
  windowStart: Date,
  windowEnd: Date,
  enabledSeverities: string[]
): Promise<DigestSummary> {
  if (enabledSeverities.length === 0) {
    return {
      date: formatDigestDate(windowEnd),
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      topAnomalies: [],
    };
  }

  const whereClause = {
    detectedAt: { gte: windowStart, lt: windowEnd },
    isBackfill: false,
    severity: { in: enabledSeverities },
  };

  const [counts, anomalies] = await Promise.all([
    prisma.anomaly.groupBy({
      by: ['severity'],
      where: whereClause,
      _count: { _all: true },
    }),
    prisma.anomaly.findMany({
      where: whereClause,
      select: {
        type: true,
        severity: true,
        message: true,
        costRecord: { select: { amount: true } },
      },
    }),
  ]);

  const countMap = new Map(counts.map((row) => [row.severity, row._count._all]));
  const severityRank: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  const topAnomalies = anomalies
    .sort((a, b) => {
      const rankA = severityRank[a.severity] ?? 99;
      const rankB = severityRank[b.severity] ?? 99;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return Number(b.costRecord.amount) - Number(a.costRecord.amount);
    })
    .slice(0, 5)
    .map((anomaly) => ({
      type: anomaly.type,
      severity: anomaly.severity,
      message: anomaly.message,
      amount: Number(anomaly.costRecord.amount),
    }));

  return {
    date: formatDigestDate(windowEnd),
    criticalCount: countMap.get('critical') ?? 0,
    warningCount: countMap.get('warning') ?? 0,
    infoCount: countMap.get('info') ?? 0,
    topAnomalies,
  };
}

async function claimDigestRecord(params: {
  digestKey: string;
  channel: string;
  recipient: string;
  userId?: string | null;
  windowStart: Date;
  windowEnd: Date;
  maxAttempts: number;
}): Promise<{ id: string } | null> {
  const existing = await prisma.dailyDigest.findUnique({
    where: {
      digestKey_channel_recipient: {
        digestKey: params.digestKey,
        channel: params.channel,
        recipient: params.recipient,
      },
    },
  });

  if (existing?.status === 'sent') {
    return null;
  }

  if (existing && existing.attempts >= params.maxAttempts) {
    return null;
  }

  const now = new Date();

  const record = await prisma.dailyDigest.upsert({
    where: {
      digestKey_channel_recipient: {
        digestKey: params.digestKey,
        channel: params.channel,
        recipient: params.recipient,
      },
    },
    create: {
      digestKey: params.digestKey,
      channel: params.channel,
      recipient: params.recipient,
      userId: params.userId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      status: 'pending',
      attempts: 1,
      lastAttemptAt: now,
    },
    update: {
      status: 'pending',
      attempts: { increment: 1 },
      lastAttemptAt: now,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      errorMessage: null,
    },
    select: { id: true },
  });

  return record;
}

async function markDigestSent(id: string): Promise<void> {
  await prisma.dailyDigest.update({
    where: { id },
    data: {
      status: 'sent',
      sentAt: new Date(),
      errorMessage: null,
    },
  });
}

async function markDigestFailed(id: string, error: string): Promise<void> {
  await prisma.dailyDigest.update({
    where: { id },
    data: {
      status: 'failed',
      errorMessage: error,
    },
  });
}

export class DailyDigestWorker {
  private config: Required<DailyDigestWorkerConfig>;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private inProgress = false;

  constructor(config: DailyDigestWorkerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
        console.warn('[DailyDigestWorker] Invalid dailyDigestTime setting:', settings.dailyDigestTime);
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

    if (!params.settings.emailEnabled && !params.settings.slackEnabled && !params.settings.teamsEnabled) {
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
            recipientName: getRecipientName(recipient.firstName, recipient.lastName, recipient.email),
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
