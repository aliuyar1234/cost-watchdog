import type { FastifyInstance } from 'fastify';
import { clearAppTimezoneCache, isValidTimeZone } from '../../lib/app-settings.js';
import { parseDailyDigestTime } from '../../lib/digest-time.js';
import { sendBadRequest } from '../../lib/errors.js';
import { isValidSlackWebhookUrl } from '../../lib/slack.js';
import { isValidTeamsWebhookUrl } from '../../lib/teams.js';
import {
  enforceAdmin,
  mergeAndUpsertSettings,
  type AlertSettingsPayload,
  type GeneralSettingsPayload,
  type ThresholdSettingsPayload,
} from './shared.js';

const ALERTS_BODY_SCHEMA = {
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
} as const;

const THRESHOLDS_BODY_SCHEMA = {
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
} as const;

const GENERAL_BODY_SCHEMA = {
  type: 'object',
  required: ['timezone'],
  properties: {
    timezone: { type: 'string', minLength: 1 },
  },
} as const;

export async function registerSettingsUpdateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.put<{ Body: AlertSettingsPayload }>(
    '/alerts',
    { schema: { body: ALERTS_BODY_SCHEMA } },
    async (request, reply) => {
      const user = request.user!;
      if (!enforceAdmin(reply, user.role)) {
        return;
      }

      const payload = request.body as AlertSettingsPayload;
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
        dailyDigestTime: payload.dailyDigestTime?.trim() ?? '',
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

      const updatedSettings = await mergeAndUpsertSettings({ alerts });
      return reply.send({ success: true, alerts: updatedSettings['alerts'] ?? alerts });
    },
  );

  fastify.put<{ Body: ThresholdSettingsPayload }>(
    '/thresholds',
    { schema: { body: THRESHOLDS_BODY_SCHEMA } },
    async (request, reply) => {
      const user = request.user!;
      if (!enforceAdmin(reply, user.role)) {
        return;
      }

      const payload = request.body as ThresholdSettingsPayload;
      const thresholds = {
        yoyThreshold: payload.yoyThreshold,
        momThreshold: payload.momThreshold,
        pricePerUnitThreshold: payload.pricePerUnitThreshold,
        budgetThreshold: payload.budgetThreshold,
        minHistoricalMonths: payload.minHistoricalMonths,
      };

      const updatedSettings = await mergeAndUpsertSettings({ thresholds });
      return reply.send({ success: true, thresholds: updatedSettings['thresholds'] ?? thresholds });
    },
  );

  fastify.put<{ Body: GeneralSettingsPayload }>(
    '/general',
    { schema: { body: GENERAL_BODY_SCHEMA } },
    async (request, reply) => {
      const user = request.user!;
      if (!enforceAdmin(reply, user.role)) {
        return;
      }

      const payload = request.body as GeneralSettingsPayload;
      const timezone = payload.timezone?.trim() ?? '';

      if (!timezone) {
        return sendBadRequest(reply, 'Timezone is required');
      }
      if (!isValidTimeZone(timezone)) {
        return sendBadRequest(reply, 'Invalid timezone (use IANA time zone, e.g. Europe/Berlin)');
      }

      const updatedSettings = await mergeAndUpsertSettings({ timezone });
      clearAppTimezoneCache();

      return reply.send({
        success: true,
        general: { timezone: updatedSettings['timezone'] ?? timezone },
      });
    },
  );
}
