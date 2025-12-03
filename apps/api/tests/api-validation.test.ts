import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import authRoutes from '../src/routes/auth.js';
import documentRoutes from '../src/routes/documents.js';
import apiKeyRoutes from '../src/routes/api-keys.js';
import authPlugin, { authenticate } from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('API validation & input hardening', () => {
  it('rejects SQL-injection style login attempts', async () => {
    const app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(authRoutes, { prefix: '/auth' });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: `' OR 1=1; --@example.com`,
        password: 'not-going-to-work',
      },
    });

    // Invalid email format returns 400 (validation error), which is correct behavior
    // The important thing is that the SQL injection attempt doesn't succeed
    expect(response.statusCode).toBe(400);
  });

  it('rejects document upload without file (validation) and returns error', async () => {
    const app = Fastify();
    await app.register(multipart);
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(documentRoutes, { prefix: '/documents' });

    const user = await prisma.user.create({
      data: {
        email: 'doc@example.com',
        passwordHash: 'placeholder',
        firstName: 'Doc',
        lastName: 'User',
        role: 'admin',
      },
    });

    const { accessToken } = await generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/documents/upload',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      // no multipart payload -> should return error
    });

    // Server returns an error code (400 or 406) when no file is provided
    expect([400, 406]).toContain(response.statusCode);
  });

  it('rejects API key creation with invalid scopes', async () => {
    const app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    // Enforce auth for this instance
    app.addHook('preHandler', authenticate);
    await app.register(apiKeyRoutes, { prefix: '/api-keys' });

    const user = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        passwordHash: 'placeholder',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
    });

    const { accessToken } = await generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        name: 'invalid-scope-key',
        scopes: ['not_a_scope'],
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
