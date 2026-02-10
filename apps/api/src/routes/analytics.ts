import type { FastifyPluginAsync } from 'fastify';
import { requireScope } from '../lib/api-key-scopes.js';
import { authenticate } from '../middleware/auth.js';
import { registerAnalyticsBreakdownRoutes } from './analytics/breakdown-routes.js';
import { registerAnalyticsDashboardRoutes } from './analytics/dashboard-routes.js';
import { registerAnalyticsTrendRoutes } from './analytics/trends-routes.js';

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireScope('read:analytics'));

  await registerAnalyticsDashboardRoutes(fastify);
  await registerAnalyticsTrendRoutes(fastify);
  await registerAnalyticsBreakdownRoutes(fastify);
};

export default analyticsRoutes;
