import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import authRoutes from '../src/routes/auth.js';

describe('Auth Routes', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(authRoutes, { prefix: '/auth' });
  });

  describe('POST /auth/register', () => {
    it('should reject registration with missing fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          // Missing password, firstName, lastName
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject weak passwords', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123', // Too short
          firstName: 'Test',
          lastName: 'User',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should reject login with invalid credentials', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
