import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import settingsRoutes from '../src/routes/settings.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';
import { testSlackWebhook, isValidSlackWebhookUrl } from '../src/lib/slack.js';
import { testTeamsWebhook, isValidTeamsWebhookUrl } from '../src/lib/teams.js';

vi.mock('../src/lib/slack.js', () => ({
  testSlackWebhook: vi.fn(),
  isValidSlackWebhookUrl: vi.fn(),
}));

vi.mock('../src/lib/teams.js', () => ({
  testTeamsWebhook: vi.fn(),
  isValidTeamsWebhookUrl: vi.fn(),
}));

describe('Settings Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let viewerToken: string;

  const slackTestMock = vi.mocked(testSlackWebhook);
  const slackValidatorMock = vi.mocked(isValidSlackWebhookUrl);
  const teamsTestMock = vi.mocked(testTeamsWebhook);
  const teamsValidatorMock = vi.mocked(isValidTeamsWebhookUrl);

  beforeEach(async () => {
    vi.clearAllMocks();

    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(settingsRoutes, { prefix: '/settings' });

    const admin = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: 'placeholder',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
    });

    const adminTokens = await generateTokenPair({
      id: admin.id,
      email: admin.email,
      role: admin.role,
    });
    adminToken = adminTokens.accessToken;

    const viewer = await prisma.user.create({
      data: {
        email: 'viewer@test.com',
        passwordHash: 'placeholder',
        firstName: 'Viewer',
        lastName: 'User',
        role: 'viewer',
      },
    });

    const viewerTokens = await generateTokenPair({
      id: viewer.id,
      email: viewer.email,
      role: viewer.role,
    });
    viewerToken = viewerTokens.accessToken;
  });

  it('returns empty settings when none exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.alerts).toBeNull();
    expect(body.thresholds).toBeNull();
    expect(body.general).toBeNull();
  });

  it('rejects non-admins from reading settings', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('updates alert settings and returns them', async () => {
    slackValidatorMock.mockReturnValue(true);

    const payload = {
      emailEnabled: true,
      slackEnabled: true,
      teamsEnabled: false,
      slackWebhookUrl: ' https://hooks.slack.com/services/T000/B000/XXXX ',
      teamsWebhookUrl: '',
      notifyOnCritical: true,
      notifyOnWarning: false,
      notifyOnInfo: true,
      dailyDigestEnabled: true,
      dailyDigestTime: '09:30',
      maxAlertsPerDay: 50,
    };

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.alerts.slackWebhookUrl).toBe('https://hooks.slack.com/services/T000/B000/XXXX');
    expect(body.alerts.maxAlertsPerDay).toBe(50);

    const readResponse = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const readBody = readResponse.json();
    expect(readBody.alerts.notifyOnInfo).toBe(true);
  });

  it('rejects invalid Slack webhook URLs when enabled', async () => {
    slackValidatorMock.mockReturnValue(false);

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        emailEnabled: true,
        slackEnabled: true,
        teamsEnabled: false,
        slackWebhookUrl: 'http://example.com',
        teamsWebhookUrl: '',
        notifyOnCritical: true,
        notifyOnWarning: true,
        notifyOnInfo: false,
        dailyDigestEnabled: false,
        dailyDigestTime: '08:00',
        maxAlertsPerDay: 50,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects invalid Teams webhook URLs when enabled', async () => {
    slackValidatorMock.mockReturnValue(true);
    teamsValidatorMock.mockReturnValue(false);

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        emailEnabled: true,
        slackEnabled: false,
        teamsEnabled: true,
        slackWebhookUrl: '',
        teamsWebhookUrl: 'not-a-url',
        notifyOnCritical: true,
        notifyOnWarning: true,
        notifyOnInfo: false,
        dailyDigestEnabled: true,
        dailyDigestTime: '08:00',
        maxAlertsPerDay: 50,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects invalid daily digest time values', async () => {
    slackValidatorMock.mockReturnValue(true);
    teamsValidatorMock.mockReturnValue(true);

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/alerts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        emailEnabled: true,
        slackEnabled: false,
        teamsEnabled: false,
        slackWebhookUrl: '',
        teamsWebhookUrl: '',
        notifyOnCritical: true,
        notifyOnWarning: true,
        notifyOnInfo: false,
        dailyDigestEnabled: true,
        dailyDigestTime: '25:99',
        maxAlertsPerDay: 50,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('updates threshold settings and returns them', async () => {
    const payload = {
      yoyThreshold: 12,
      momThreshold: 18,
      pricePerUnitThreshold: 25,
      budgetThreshold: 8,
      minHistoricalMonths: 10,
    };

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/thresholds',
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.thresholds.budgetThreshold).toBe(8);

    const readResponse = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const readBody = readResponse.json();
    expect(readBody.thresholds.minHistoricalMonths).toBe(10);
  });

  it('updates general settings and returns them', async () => {
    const payload = {
      timezone: 'Europe/Berlin',
    };

    const response = await app.inject({
      method: 'PUT',
      url: '/settings/general',
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.general.timezone).toBe('Europe/Berlin');

    const readResponse = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const readBody = readResponse.json();
    expect(readBody.general.timezone).toBe('Europe/Berlin');
  });

  it('rejects invalid timezones', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/settings/general',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        timezone: 'Not/AZone',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects non-admins from updating thresholds', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/settings/thresholds',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        yoyThreshold: 10,
        momThreshold: 15,
        pricePerUnitThreshold: 20,
        budgetThreshold: 5,
        minHistoricalMonths: 6,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects non-admins from updating general settings', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/settings/general',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        timezone: 'Europe/Berlin',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows admins to test Slack webhooks', async () => {
    slackValidatorMock.mockReturnValue(true);
    slackTestMock.mockResolvedValue({ success: true });

    const response = await app.inject({
      method: 'POST',
      url: '/settings/test-slack',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it('rejects invalid Slack webhook URLs', async () => {
    slackValidatorMock.mockReturnValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/settings/test-slack',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { webhookUrl: 'http://example.com' },
    });

    expect(response.statusCode).toBe(400);
    expect(slackTestMock).not.toHaveBeenCalled();
  });

  it('returns 502 when Slack webhook test fails', async () => {
    slackValidatorMock.mockReturnValue(true);
    slackTestMock.mockResolvedValue({ success: false, error: 'Slack webhook failed' });

    const response = await app.inject({
      method: 'POST',
      url: '/settings/test-slack',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX' },
    });

    expect(response.statusCode).toBe(502);
  });

  it('rejects non-admin users for Slack webhook tests', async () => {
    slackValidatorMock.mockReturnValue(true);
    slackTestMock.mockResolvedValue({ success: true });

    const response = await app.inject({
      method: 'POST',
      url: '/settings/test-slack',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX' },
    });

    expect(response.statusCode).toBe(403);
    expect(slackTestMock).not.toHaveBeenCalled();
  });

  it('allows admins to test Teams webhooks', async () => {
    teamsValidatorMock.mockReturnValue(true);
    teamsTestMock.mockResolvedValue({ success: true });

    const response = await app.inject({
      method: 'POST',
      url: '/settings/test-teams',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { webhookUrl: 'https://example.webhook.office.com/webhookb2/XXXX' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it('rejects invalid Teams webhook URLs', async () => {
    teamsValidatorMock.mockReturnValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/settings/test-teams',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { webhookUrl: 'not-a-url' },
    });

    expect(response.statusCode).toBe(400);
    expect(teamsTestMock).not.toHaveBeenCalled();
  });
});
