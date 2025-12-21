import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { sendBadRequest, sendForbidden } from '../lib/errors.js';
import { testSlackWebhook, isValidSlackWebhookUrl } from '../lib/slack.js';
import { testTeamsWebhook, isValidTeamsWebhookUrl } from '../lib/teams.js';
import { prisma } from '../lib/db.js';
import { parseDailyDigestTime } from '../lib/digest-time.js';
import { clearAppTimezoneCache, isValidTimeZone } from '../lib/app-settings.js';

interface TestWebhookBody {
  webhookUrl: string;
}

interface AlertSettingsPayload {
  emailEnabled: boolean;
  slackEnabled: boolean;
  teamsEnabled: boolean;
  slackWebhookUrl: string;
  teamsWebhookUrl: string;
  notifyOnCritical: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  maxAlertsPerDay: number;
}

interface ThresholdSettingsPayload {
  yoyThreshold: number;
  momThreshold: number;
  pricePerUnitThreshold: number;
  budgetThreshold: number;
  minHistoricalMonths: number;
}

interface GeneralSettingsPayload {
  timezone: string;
}

type SettingsStore = Record<string, unknown>;

function requireAdmin(role: string): boolean {
  return role === 'admin';
}

function normalizeSettings(value: unknown): SettingsStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as SettingsStore;
}

/**
 * Settings routes (admin only).
 */
export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /settings
   */
  fastify.get(
    '/',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const record = await prisma.appSettings.findFirst();
      const settings = normalizeSettings(record?.settings);

      return reply.send({
        alerts: settings['alerts'] ?? null,
        thresholds: settings['thresholds'] ?? null,
        general: typeof settings['timezone'] === 'string' && settings['timezone'].trim()
          ? { timezone: settings['timezone'] }
          : null,
      });
    }
  );

  /**
   * PUT /settings/alerts
   */
  fastify.put<{ Body: AlertSettingsPayload }>(
    '/alerts',
    {
      schema: {
        body: {
          type: 'object',
          required: [
            'emailEnabled',
            'slackEnabled',
            'teamsEnabled',
            'slackWebhookUrl',
            'teamsWebhookUrl',
            'notifyOnCritical',
            'notifyOnWarning',
            'notifyOnInfo',
            'dailyDigestEnabled',
            'dailyDigestTime',
            'maxAlertsPerDay',
          ],
          properties: {
            emailEnabled: { type: 'boolean' },
            slackEnabled: { type: 'boolean' },
            teamsEnabled: { type: 'boolean' },
            slackWebhookUrl: { type: 'string' },
            teamsWebhookUrl: { type: 'string' },
            notifyOnCritical: { type: 'boolean' },
            notifyOnWarning: { type: 'boolean' },
            notifyOnInfo: { type: 'boolean' },
            dailyDigestEnabled: { type: 'boolean' },
            dailyDigestTime: { type: 'string' },
            maxAlertsPerDay: { type: 'number', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const payload = request.body as AlertSettingsPayload;
      const digestTime = payload.dailyDigestTime?.trim() ?? '';

      const alerts = {
        emailEnabled: payload.emailEnabled,
        slackEnabled: payload.slackEnabled,
        teamsEnabled: payload.teamsEnabled,
        slackWebhookUrl: payload.slackWebhookUrl?.trim() ?? '',
        teamsWebhookUrl: payload.teamsWebhookUrl?.trim() ?? '',
        notifyOnCritical: payload.notifyOnCritical,
        notifyOnWarning: payload.notifyOnWarning,
        notifyOnInfo: payload.notifyOnInfo,
        dailyDigestEnabled: payload.dailyDigestEnabled,
        dailyDigestTime: digestTime,
        maxAlertsPerDay: payload.maxAlertsPerDay,
      };

      if (!parseDailyDigestTime(alerts.dailyDigestTime)) {
        return sendBadRequest(reply, 'Invalid daily digest time (use HH:mm)');
      }

      if (alerts.slackEnabled && !isValidSlackWebhookUrl(alerts.slackWebhookUrl)) {
        return sendBadRequest(reply, 'Invalid Slack webhook URL');
      }

      if (alerts.teamsEnabled && !isValidTeamsWebhookUrl(alerts.teamsWebhookUrl)) {
        return sendBadRequest(reply, 'Invalid Teams webhook URL');
      }

      const existing = await prisma.appSettings.findFirst();
      const existingSettings = normalizeSettings(existing?.settings);
      const record = await prisma.appSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          settings: { alerts },
        },
        update: {
          settings: {
            ...existingSettings,
            alerts,
          },
        },
      });
      const updatedSettings = normalizeSettings(record.settings);

      return reply.send({ success: true, alerts: updatedSettings['alerts'] ?? alerts });
    }
  );

  /**
   * PUT /settings/thresholds
   */
  fastify.put<{ Body: ThresholdSettingsPayload }>(
    '/thresholds',
    {
      schema: {
        body: {
          type: 'object',
          required: [
            'yoyThreshold',
            'momThreshold',
            'pricePerUnitThreshold',
            'budgetThreshold',
            'minHistoricalMonths',
          ],
          properties: {
            yoyThreshold: { type: 'number', minimum: 0 },
            momThreshold: { type: 'number', minimum: 0 },
            pricePerUnitThreshold: { type: 'number', minimum: 0 },
            budgetThreshold: { type: 'number', minimum: 0 },
            minHistoricalMonths: { type: 'number', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const payload = request.body as ThresholdSettingsPayload;

      const thresholds = {
        yoyThreshold: payload.yoyThreshold,
        momThreshold: payload.momThreshold,
        pricePerUnitThreshold: payload.pricePerUnitThreshold,
        budgetThreshold: payload.budgetThreshold,
        minHistoricalMonths: payload.minHistoricalMonths,
      };

      const existing = await prisma.appSettings.findFirst();
      const existingSettings = normalizeSettings(existing?.settings);
      const record = await prisma.appSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          settings: { thresholds },
        },
        update: {
          settings: {
            ...existingSettings,
            thresholds,
          },
        },
      });
      const updatedSettings = normalizeSettings(record.settings);

      return reply.send({ success: true, thresholds: updatedSettings['thresholds'] ?? thresholds });
    }
  );

  /**
   * PUT /settings/general
   */
  fastify.put<{ Body: GeneralSettingsPayload }>(
    '/general',
    {
      schema: {
        body: {
          type: 'object',
          required: ['timezone'],
          properties: {
            timezone: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const payload = request.body as GeneralSettingsPayload;
      const timezone = payload.timezone?.trim() ?? '';

      if (!timezone) {
        return sendBadRequest(reply, 'Timezone is required');
      }

      if (!isValidTimeZone(timezone)) {
        return sendBadRequest(reply, 'Invalid timezone (use IANA time zone, e.g. Europe/Berlin)');
      }

      const existing = await prisma.appSettings.findFirst();
      const existingSettings = normalizeSettings(existing?.settings);
      const record = await prisma.appSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          settings: { timezone },
        },
        update: {
          settings: {
            ...existingSettings,
            timezone,
          },
        },
      });

      clearAppTimezoneCache();
      const updatedSettings = normalizeSettings(record.settings);

      return reply.send({
        success: true,
        general: { timezone: updatedSettings['timezone'] ?? timezone },
      });
    }
  );

  /**
   * POST /settings/test-slack
   */
  fastify.post<{ Body: TestWebhookBody }>(
    '/test-slack',
    {
      schema: {
        body: {
          type: 'object',
          required: ['webhookUrl'],
          properties: {
            webhookUrl: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const webhookUrl = typeof request.body?.webhookUrl === 'string'
        ? request.body.webhookUrl.trim()
        : '';

      if (!webhookUrl) {
        return sendBadRequest(reply, 'Webhook URL is required');
      }

      if (!isValidSlackWebhookUrl(webhookUrl)) {
        return sendBadRequest(reply, 'Invalid Slack webhook URL');
      }

      const result = await testSlackWebhook(webhookUrl);
      if (!result.success) {
        return reply.status(502).send({
          error: 'Bad Gateway',
          message: result.error || 'Slack webhook test failed',
        });
      }

      return reply.send({
        success: true,
        message: 'Slack webhook test successful',
      });
    }
  );

  /**
   * POST /settings/test-teams
   */
  fastify.post<{ Body: TestWebhookBody }>(
    '/test-teams',
    {
      schema: {
        body: {
          type: 'object',
          required: ['webhookUrl'],
          properties: {
            webhookUrl: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const webhookUrl = typeof request.body?.webhookUrl === 'string'
        ? request.body.webhookUrl.trim()
        : '';

      if (!webhookUrl) {
        return sendBadRequest(reply, 'Webhook URL is required');
      }

      if (!isValidTeamsWebhookUrl(webhookUrl)) {
        return sendBadRequest(reply, 'Invalid Teams webhook URL');
      }

      const result = await testTeamsWebhook(webhookUrl);
      if (!result.success) {
        return reply.status(502).send({
          error: 'Bad Gateway',
          message: result.error || 'Teams webhook test failed',
        });
      }

      return reply.send({
        success: true,
        message: 'Teams webhook test successful',
      });
    }
  );
};

export default settingsRoutes;
