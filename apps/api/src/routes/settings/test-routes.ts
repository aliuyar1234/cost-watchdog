import type { FastifyInstance } from 'fastify';
import { sendBadRequest } from '../../lib/errors.js';
import { isValidSlackWebhookUrl, testSlackWebhook } from '../../lib/slack.js';
import { isValidTeamsWebhookUrl, testTeamsWebhook } from '../../lib/teams.js';
import { enforceAdmin, type TestWebhookBody } from './shared.js';

const TEST_WEBHOOK_SCHEMA = {
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
} as const;

export async function registerSettingsTestRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: TestWebhookBody }>(
    '/test-slack',
    { schema: TEST_WEBHOOK_SCHEMA },
    async (request, reply) => {
      const user = request.user!;
      if (!enforceAdmin(reply, user.role)) {
        return;
      }

      const webhookUrl =
        typeof request.body?.webhookUrl === 'string' ? request.body.webhookUrl.trim() : '';
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
    },
  );

  fastify.post<{ Body: TestWebhookBody }>(
    '/test-teams',
    { schema: TEST_WEBHOOK_SCHEMA },
    async (request, reply) => {
      const user = request.user!;
      if (!enforceAdmin(reply, user.role)) {
        return;
      }

      const webhookUrl =
        typeof request.body?.webhookUrl === 'string' ? request.body.webhookUrl.trim() : '';
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
    },
  );
}
