import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerOpenApi } from '../src/lib/openapi.js';

const originalNodeEnv = process.env['NODE_ENV'];
const originalOpenApiDocsEnabled = process.env['OPENAPI_DOCS_ENABLED'];

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env['NODE_ENV'];
  } else {
    process.env['NODE_ENV'] = originalNodeEnv;
  }

  if (originalOpenApiDocsEnabled === undefined) {
    delete process.env['OPENAPI_DOCS_ENABLED'];
  } else {
    process.env['OPENAPI_DOCS_ENABLED'] = originalOpenApiDocsEnabled;
  }
});

describe('OpenAPI routes exposure', () => {
  it('serves docs/spec routes in non-production by default', async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['OPENAPI_DOCS_ENABLED'];

    const app = Fastify();
    await registerOpenApi(app);

    const jsonResponse = await app.inject({
      method: 'GET',
      url: '/openapi.json',
    });
    const docsResponse = await app.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(jsonResponse.statusCode).toBe(200);
    expect(docsResponse.statusCode).toBe(200);
  });

  it('disables docs/spec routes in production by default', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['OPENAPI_DOCS_ENABLED'];

    const app = Fastify();
    await registerOpenApi(app);

    const jsonResponse = await app.inject({
      method: 'GET',
      url: '/openapi.json',
    });
    const docsResponse = await app.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(jsonResponse.statusCode).toBe(404);
    expect(docsResponse.statusCode).toBe(404);
  });

  it('allows docs/spec routes in production when explicitly enabled', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['OPENAPI_DOCS_ENABLED'] = 'true';

    const app = Fastify();
    await registerOpenApi(app);

    const jsonResponse = await app.inject({
      method: 'GET',
      url: '/openapi.json',
    });
    const docsResponse = await app.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(jsonResponse.statusCode).toBe(200);
    expect(docsResponse.statusCode).toBe(200);
  });
});
