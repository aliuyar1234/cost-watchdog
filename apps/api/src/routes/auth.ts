import type { FastifyInstance } from 'fastify';
import { registerAuthProtectedRoutes } from './auth/protected-routes.js';
import { registerAuthPublicRoutes } from './auth/public-routes.js';

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  await registerAuthPublicRoutes(fastify);
  await registerAuthProtectedRoutes(fastify);
}
