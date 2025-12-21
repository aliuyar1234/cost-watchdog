import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from './setup';
import { createDailyDigestWorker } from '../src/workers/daily-digest.worker.js';
import { clearAlertSettingsCache } from '../src/lib/alert-settings.js';
import { clearAppTimezoneCache } from '../src/lib/app-settings.js';
import { sendDailyDigestEmail, isEmailConfigured } from '../src/lib/email.js';
import { sendSlackDailyDigest } from '../src/lib/slack.js';
import { sendTeamsDailyDigest } from '../src/lib/teams.js';

vi.mock('../src/lib/email.js', () => ({
  sendDailyDigestEmail: vi.fn(),
  isEmailConfigured: vi.fn(),
}));

vi.mock('../src/lib/slack.js', () => ({
  sendSlackDailyDigest: vi.fn(),
}));

vi.mock('../src/lib/teams.js', () => ({
  sendTeamsDailyDigest: vi.fn(),
}));

describe('DailyDigestWorker', () => {
  const sendEmailMock = vi.mocked(sendDailyDigestEmail);
  const emailConfiguredMock = vi.mocked(isEmailConfigured);
  const sendSlackMock = vi.mocked(sendSlackDailyDigest);
  const sendTeamsMock = vi.mocked(sendTeamsDailyDigest);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 1, 2, 8, 30, 0));
    vi.clearAllMocks();
    clearAlertSettingsCache();
    clearAppTimezoneCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends daily digest email and records delivery', async () => {
    emailConfiguredMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue({ success: true, messageId: 'digest-1' });
    sendSlackMock.mockResolvedValue({ success: true });
    sendTeamsMock.mockResolvedValue({ success: true });

    const admin = await prisma.user.create({
      data: {
        email: 'digest-admin@test.com',
        passwordHash: 'placeholder',
        firstName: 'Digest',
        lastName: 'Admin',
        role: 'admin',
        notificationSettings: { emailAlertsEnabled: true, dailyDigestEnabled: true },
      },
    });

    const org = await prisma.organization.create({
      data: { name: 'Digest Org', legalName: 'Digest Org GmbH' },
    });

    const location = await prisma.location.create({
      data: {
        organizationId: org.id,
        name: 'HQ',
        address: { country: 'DE' },
        type: 'office',
        ownershipType: 'leased',
      },
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: 'Digest Supplier',
        category: 'energy_electricity',
        costTypes: ['electricity'],
      },
    });

    const costRecord = await prisma.costRecord.create({
      data: {
        supplierId: supplier.id,
        locationId: location.id,
        periodStart: new Date(2024, 0, 1),
        periodEnd: new Date(2024, 0, 31),
        amount: 1200,
        costType: 'electricity',
        currency: 'EUR',
      },
    });

    await prisma.anomaly.create({
      data: {
        costRecordId: costRecord.id,
        type: 'yoy_deviation',
        severity: 'warning',
        status: 'new',
        message: 'Digest anomaly',
        details: {},
        isBackfill: false,
        detectedAt: new Date(2024, 1, 1, 12, 0, 0),
      },
    });

    await prisma.appSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        settings: {
          alerts: {
            emailEnabled: true,
            slackEnabled: false,
            teamsEnabled: false,
            slackWebhookUrl: '',
            teamsWebhookUrl: '',
            notifyOnCritical: true,
            notifyOnWarning: true,
            notifyOnInfo: true,
            dailyDigestEnabled: true,
            dailyDigestTime: '08:00',
            maxAlertsPerDay: 50,
          },
        },
      },
      update: {
        settings: {
          alerts: {
            emailEnabled: true,
            slackEnabled: false,
            teamsEnabled: false,
            slackWebhookUrl: '',
            teamsWebhookUrl: '',
            notifyOnCritical: true,
            notifyOnWarning: true,
            notifyOnInfo: true,
            dailyDigestEnabled: true,
            dailyDigestTime: '08:00',
            maxAlertsPerDay: 50,
          },
        },
      },
    });

    const worker = createDailyDigestWorker({
      pollIntervalMs: 60000,
      runOnStartup: true,
    });

    await worker.start();
    worker.stop();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSlackMock).not.toHaveBeenCalled();
    expect(sendTeamsMock).not.toHaveBeenCalled();

    const digest = await prisma.dailyDigest.findFirst({
      where: { recipient: admin.email },
    });

    expect(digest).toBeTruthy();
    expect(digest?.status).toBe('sent');
  });

  it('respects app timezone when scheduling', async () => {
    emailConfiguredMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue({ success: true, messageId: 'digest-2' });

    await prisma.appSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        settings: {
          timezone: 'UTC',
          alerts: {
            emailEnabled: true,
            slackEnabled: false,
            teamsEnabled: false,
            slackWebhookUrl: '',
            teamsWebhookUrl: '',
            notifyOnCritical: true,
            notifyOnWarning: true,
            notifyOnInfo: true,
            dailyDigestEnabled: true,
            dailyDigestTime: '08:00',
            maxAlertsPerDay: 50,
          },
        },
      },
      update: {
        settings: {
          timezone: 'UTC',
          alerts: {
            emailEnabled: true,
            slackEnabled: false,
            teamsEnabled: false,
            slackWebhookUrl: '',
            teamsWebhookUrl: '',
            notifyOnCritical: true,
            notifyOnWarning: true,
            notifyOnInfo: true,
            dailyDigestEnabled: true,
            dailyDigestTime: '08:00',
            maxAlertsPerDay: 50,
          },
        },
      },
    });

    clearAlertSettingsCache();
    clearAppTimezoneCache();
    vi.setSystemTime(new Date('2024-02-02T07:30:00Z'));

    const worker = createDailyDigestWorker({
      pollIntervalMs: 60000,
      runOnStartup: true,
    });

    await worker.start();
    worker.stop();

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
