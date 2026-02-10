import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { registerDocumentReadRoutes } from './documents/read-routes.js';
import { registerDocumentWriteRoutes } from './documents/write-routes.js';

export default async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  await registerDocumentWriteRoutes(fastify);
  await registerDocumentReadRoutes(fastify);
}
