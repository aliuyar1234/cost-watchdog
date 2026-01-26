import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import authRoutes from '../src/routes/auth.js';
import sessionRoutes from '../src/routes/sessions.js';
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
    await app.register(sessionRoutes, { prefix: '/users' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('registers, logs in, and returns /auth/me with valid token', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'user1@example.com',
        password: 'Str0ngP@ss!123',
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
        password: 'Str0ngP@ss!123',
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

  it('first registered user becomes admin when INITIAL_ADMIN_EMAIL matches', async () => {
    // Set the INITIAL_ADMIN_EMAIL to match the registering user
    vi.stubEnv('INITIAL_ADMIN_EMAIL', 'firstadmin@example.com');

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'firstadmin@example.com',
        password: 'Str0ngP@ss!123',
        firstName: 'First',
        lastName: 'Admin',
      },
    });
    expect(register.statusCode).toBe(201);

    const body = register.json<{ user: { role: string } }>();
    expect(body.user.role).toBe('admin');
  });

  it('first registered user is viewer when INITIAL_ADMIN_EMAIL not set', async () => {
    // Ensure INITIAL_ADMIN_EMAIL is not set
    vi.stubEnv('INITIAL_ADMIN_EMAIL', '');

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'firstuser@example.com',
        password: 'Str0ngP@ss!123',
        firstName: 'First',
        lastName: 'User',
      },
    });
    expect(register.statusCode).toBe(201);

    const body = register.json<{ user: { role: string } }>();
    expect(body.user.role).toBe('viewer');
  });

  it('first registered user is viewer when email does not match INITIAL_ADMIN_EMAIL', async () => {
    // Set INITIAL_ADMIN_EMAIL to a different address
    vi.stubEnv('INITIAL_ADMIN_EMAIL', 'expected-admin@example.com');

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'different-user@example.com',
        password: 'Str0ngP@ss!123',
        firstName: 'Different',
        lastName: 'User',
      },
    });
    expect(register.statusCode).toBe(201);

    const body = register.json<{ user: { role: string } }>();
    expect(body.user.role).toBe('viewer');
  });

  it('rejects invalid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'doesnotexist@example.com',
        password: 'Wr0ngP@ssword!123',
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

  it('rotates refresh tokens and detects reuse (token theft)', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'rotate@example.com',
        password: 'Str0ngP@ss!123',
        firstName: 'Rotate',
        lastName: 'User',
      },
    });
    expect(register.statusCode).toBe(201);

    const { refreshToken: refreshToken1 } = register.json<{ refreshToken: string }>();
    expect(refreshToken1).toBeTruthy();

    const refresh1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refreshToken1 },
    });

    expect(refresh1.statusCode).toBe(200);
    const { refreshToken: refreshToken2 } = refresh1.json<{ refreshToken: string }>();
    expect(refreshToken2).toBeTruthy();
    expect(refreshToken2).not.toBe(refreshToken1);

    const reuseOld = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refreshToken1 },
    });

    expect(reuseOld.statusCode).toBe(401);
    const reuseOldBody = reuseOld.json<{ securityEvent?: boolean }>();
    expect(reuseOldBody.securityEvent).toBe(true);

    const afterTheft = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refreshToken2 },
    });

    expect(afterTheft.statusCode).toBe(401);
  });

  it('terminating sessions invalidates access tokens via JTI blacklist', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'sessions@example.com',
        password: 'Str0ngP@ss!123',
        firstName: 'Sess',
        lastName: 'User',
      },
    });
    expect(register.statusCode).toBe(201);

    const { accessToken } = register.json<{ accessToken: string }>();
    expect(accessToken).toBeTruthy();

    const terminate = await app.inject({
      method: 'DELETE',
      url: '/users/me/sessions',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(terminate.statusCode).toBe(200);

    const meAfter = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(meAfter.statusCode).toBe(401);
  });
});
