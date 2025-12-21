import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import notificationSettingsRoutes from '../src/routes/notification-settings.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('Notification Settings Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let userToken: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(notificationSettingsRoutes, { prefix: '/notification-settings' });

    const user = await prisma.user.create({
      data: {
        email: 'user@test.com',
        passwordHash: 'placeholder',
        firstName: 'Test',
        lastName: 'User',
        role: 'viewer',
      },
    });

    const tokens = await generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    userToken = tokens.accessToken;
  });

  it('returns default notification settings for the current user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/notification-settings',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.settings.emailAlertsEnabled).toBe(true);
    expect(body.settings.dailyDigestEnabled).toBe(true);
  });

  it('updates notification settings for the current user', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/notification-settings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        emailAlertsEnabled: false,
        dailyDigestEnabled: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.settings.emailAlertsEnabled).toBe(false);
    expect(body.settings.dailyDigestEnabled).toBe(false);
  });
});
