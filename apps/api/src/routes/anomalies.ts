import type { FastifyPluginAsync } from 'fastify';
import { requireScope } from '../lib/api-key-scopes.js';
import { authenticate } from '../middleware/auth.js';
import { registerAnomalyReadRoutes } from './anomalies/read-routes.js';
import { registerAnomalyWriteRoutes } from './anomalies/write-routes.js';

export const anomalyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', async (request, reply) => {
    const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
    if (isReadMethod) {
      await requireScope('read:anomalies')(request, reply);
    }
  });

  await registerAnomalyReadRoutes(fastify);
  await registerAnomalyWriteRoutes(fastify);
};

export default anomalyRoutes;
