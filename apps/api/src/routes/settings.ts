import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { registerSettingsReadRoutes } from './settings/read-routes.js';
import { registerSettingsTestRoutes } from './settings/test-routes.js';
import { registerSettingsUpdateRoutes } from './settings/update-routes.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  await registerSettingsReadRoutes(fastify);
  await registerSettingsUpdateRoutes(fastify);
  await registerSettingsTestRoutes(fastify);
};

export default settingsRoutes;
