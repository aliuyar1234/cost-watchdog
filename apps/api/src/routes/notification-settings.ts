import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { sendBadRequest } from '../lib/errors.js';
import { prisma } from '../lib/db.js';
import { resolveUserNotificationSettings } from '../lib/notification-settings.js';

interface NotificationSettingsPayload {
  emailAlertsEnabled?: boolean;
  dailyDigestEnabled?: boolean;
}

/**
 * Notification settings routes (current user).
 */
export const notificationSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (request, reply) => {
    const user = request.user!;

    const record = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { notificationSettings: true },
    });

    return reply.send({
      settings: resolveUserNotificationSettings(record?.notificationSettings),
    });
  });

  fastify.put<{ Body: NotificationSettingsPayload }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            emailAlertsEnabled: { type: 'boolean' },
            dailyDigestEnabled: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const payload = request.body as NotificationSettingsPayload;

      if (!payload || typeof payload !== 'object') {
        return sendBadRequest(reply, 'Invalid notification settings payload');
      }

      const record = await prisma.user.findUnique({
        where: { id: user.sub },
        select: { notificationSettings: true },
      });
      const current = resolveUserNotificationSettings(record?.notificationSettings);

      const updated = {
        emailAlertsEnabled: typeof payload.emailAlertsEnabled === 'boolean'
          ? payload.emailAlertsEnabled
          : current.emailAlertsEnabled,
        dailyDigestEnabled: typeof payload.dailyDigestEnabled === 'boolean'
          ? payload.dailyDigestEnabled
          : current.dailyDigestEnabled,
      };

      await prisma.user.update({
        where: { id: user.sub },
        data: { notificationSettings: updated },
      });

      return reply.send({ success: true, settings: updated });
    }
  );
};

export default notificationSettingsRoutes;
