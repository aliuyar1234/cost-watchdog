import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import csrfPlugin, { csrfRoutes } from '../src/middleware/csrf.js';
import { CSRF_COOKIE_NAME } from '../src/lib/csrf.js';

vi.mock('../src/lib/secrets.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/secrets.js')>('../src/lib/secrets.js');

  return {
    ...actual,
    secrets: {
      ...actual.secrets,
      getAuthSecret: () => 'docker-secret-auth-32-chars-minimum!!',
    },
  };
});

describe('CSRF middleware (docker secrets mode)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('generates a CSRF token even when AUTH_SECRET env var is not set', async () => {
    vi.stubEnv('AUTH_SECRET', '');

    const app = Fastify();
    await app.register(cookie);
    await app.register(csrfPlugin);
    await app.register(csrfRoutes, { prefix: '/csrf' });

    const response = await app.inject({
      method: 'GET',
      url: '/csrf/token',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ token: string }>();
    expect(body.token).toBeTruthy();

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const setCookieString = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(setCookieString).toContain(`${CSRF_COOKIE_NAME}=`);
  });
});
