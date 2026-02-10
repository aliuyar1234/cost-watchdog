import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/db.js';
import { enforceAdmin, normalizeSettings } from './shared.js';

export async function registerSettingsReadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request, reply) => {
    const user = request.user!;
    if (!enforceAdmin(reply, user.role)) {
      return;
    }

    const record = await prisma.appSettings.findFirst();
    const settings = normalizeSettings(record?.settings);

    return reply.send({
      alerts: settings['alerts'] ?? null,
      thresholds: settings['thresholds'] ?? null,
      general:
        typeof settings['timezone'] === 'string' && settings['timezone'].trim()
          ? { timezone: settings['timezone'] }
          : null,
    });
  });
}
