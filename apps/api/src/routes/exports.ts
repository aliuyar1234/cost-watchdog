import type { FastifyPluginAsync } from 'fastify';
import { requireScope } from '../lib/api-key-scopes.js';
import { rateLimitEndpoint } from '../lib/rate-limit.js';
import { authenticate } from '../middleware/auth.js';
import { registerAnomalyExportRoutes } from './exports/anomaly-export-routes.js';
import { registerCostRecordExportRoutes } from './exports/cost-record-routes.js';
import { registerMonthlyReportExportRoutes } from './exports/monthly-report-routes.js';

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireScope('read:exports'));
  fastify.addHook('preHandler', rateLimitEndpoint('export'));

  await registerCostRecordExportRoutes(fastify);
  await registerAnomalyExportRoutes(fastify);
  await registerMonthlyReportExportRoutes(fastify);
};

export default exportRoutes;
