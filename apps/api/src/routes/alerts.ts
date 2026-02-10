import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireScope } from '../lib/api-key-scopes.js';
import { isTrackClickRoute, generateAlertToken } from './alerts/shared.js';
import { registerAlertReadRoutes } from './alerts/read-routes.js';
import { registerAlertWriteRoutes } from './alerts/write-routes.js';

export { generateAlertToken };

export const alertRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (isTrackClickRoute(request)) {
      return;
    }

    await (authenticate as (req: typeof request, rep: typeof reply) => Promise<void>)(
      request,
      reply,
    );
    const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
    const requiredScope = isReadMethod ? 'read:alerts' : 'write:alerts';
    await requireScope(requiredScope)(request, reply);
  });

  await registerAlertReadRoutes(fastify);
  await registerAlertWriteRoutes(fastify);
};

export default alertRoutes;
