import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { registerUserReadRoutes } from './users/read-routes.js';
import { registerUserWriteRoutes } from './users/write-routes.js';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  await registerUserReadRoutes(fastify);
  await registerUserWriteRoutes(fastify);
};

export default userRoutes;
