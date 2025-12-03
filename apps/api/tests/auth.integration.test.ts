import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import authRoutes from '../src/routes/auth.js';
import authPlugin from '../src/middleware/auth.js';
import { generateAccessToken, verifyToken } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('Auth integration', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(authRoutes, { prefix: '/auth' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers, logs in, and returns /auth/me with valid token', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'user1@example.com',
        password: 'Str0ngP@ss!',
        firstName: 'Test',
        lastName: 'User',
      },
    });
    expect(register.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user1@example.com',
        password: 'Str0ngP@ss!',
      },
    });
    expect(login.statusCode).toBe(200);

    const { accessToken } = login.json<{ accessToken: string }>();
    expect(accessToken).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(me.statusCode).toBe(200);
    const body = me.json<{ user: { email: string } }>();
    expect(body.user.email).toBe('user1@example.com');
  });

  it('first registered user becomes admin', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'firstuser@example.com',
        password: 'Str0ngP@ss!',
        firstName: 'First',
        lastName: 'User',
      },
    });
    expect(register.statusCode).toBe(201);

    const body = register.json<{ user: { role: string } }>();
    expect(body.user.role).toBe('admin');
  });

  it('rejects invalid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'doesnotexist@example.com',
        password: 'wrong-password',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects tampered/expired access tokens', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'ttl@example.com',
        passwordHash: 'placeholder',
        firstName: 'TTL',
        lastName: 'User',
        role: 'admin',
      },
    });

    const token = await generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000); // >15m

    const verified = await verifyToken(token);
    expect(verified).toBeNull();
  });
});
