import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { registerMfaChallengeRoutes } from './mfa/challenge-routes.js';
import { registerMfaEnrollmentRoutes } from './mfa/enrollment-routes.js';
import { registerMfaManagementRoutes } from './mfa/management-routes.js';
import { registerMfaStatusRoutes } from './mfa/status-routes.js';

export const mfaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  await registerMfaStatusRoutes(fastify);
  await registerMfaEnrollmentRoutes(fastify);
  await registerMfaChallengeRoutes(fastify);
  await registerMfaManagementRoutes(fastify);
};

export default mfaRoutes;
