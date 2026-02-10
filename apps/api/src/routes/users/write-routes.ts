import type { FastifyInstance } from 'fastify';
import { registerUserLifecycleRoutes } from './write-lifecycle-routes.js';
import { registerUserSecurityRoutes } from './write-security-routes.js';
import { registerUserGdprRoutes } from './write-gdpr-routes.js';

export async function registerUserWriteRoutes(fastify: FastifyInstance): Promise<void> {
  await registerUserLifecycleRoutes(fastify);
  await registerUserSecurityRoutes(fastify);
  await registerUserGdprRoutes(fastify);
}
