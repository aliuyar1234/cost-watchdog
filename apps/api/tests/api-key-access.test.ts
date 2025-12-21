import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { createHash } from 'crypto';
import authPlugin from '../src/middleware/auth.js';
import { validateApiKey } from '../src/middleware/api-key.js';
import analyticsRoutes from '../src/routes/analytics.js';
import documentRoutes from '../src/routes/documents.js';
import exportRoutes from '../src/routes/exports.js';
import alertRoutes from '../src/routes/alerts.js';
import { prisma } from './setup';

describe('API Key Access', () => {
  let app: ReturnType<typeof Fastify>;
  let adminUserId: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    app.addHook('preHandler', validateApiKey);

    await app.register(analyticsRoutes, { prefix: '/analytics' });
    await app.register(documentRoutes, { prefix: '/documents' });
    await app.register(exportRoutes, { prefix: '/exports' });
    await app.register(alertRoutes, { prefix: '/alerts' });

    const admin = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: 'placeholder',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
    });
    adminUserId = admin.id;
  });

  async function createApiKey(scopes: string[]): Promise<string> {
    const rawKey = `cwk_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await prisma.apiKey.create({
      data: {
        name: `Test Key ${Date.now()}`,
        keyHash,
        keyPrefix: rawKey.substring(0, 12),
        scopes,
        createdById: adminUserId,
        isActive: true,
      },
    });

    return rawKey;
  }

  async function createDocument(extractionStatus = 'failed') {
    return prisma.document.create({
      data: {
        filename: 'test-document.pdf',
        originalFilename: 'test-document.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileHash: `hash-${Date.now()}-${Math.random()}`,
        storagePath: 'documents/2024/01/test-document.pdf',
        extractionStatus,
        verificationStatus: 'pending',
        costTypes: [],
        uploadedBy: adminUserId,
      },
    });
  }

  it('allows read:analytics for analytics dashboard', async () => {
    const apiKey = await createApiKey(['read:analytics']);

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects analytics access without scope', async () => {
    const apiKey = await createApiKey(['read:documents']);

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows read:documents for document listing', async () => {
    const apiKey = await createApiKey(['read:documents']);

    const response = await app.inject({
      method: 'GET',
      url: '/documents',
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(200);
  });

  it('requires write:documents for retry extraction', async () => {
    const apiKey = await createApiKey(['read:documents']);
    const doc = await createDocument('failed');

    const response = await app.inject({
      method: 'POST',
      url: `/documents/${doc.id}/retry-extraction`,
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows write:documents for retry extraction', async () => {
    const apiKey = await createApiKey(['write:documents']);
    const doc = await createDocument('failed');

    const response = await app.inject({
      method: 'POST',
      url: `/documents/${doc.id}/retry-extraction`,
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows read:exports for cost record export', async () => {
    const apiKey = await createApiKey(['read:exports']);

    const response = await app.inject({
      method: 'GET',
      url: '/exports/cost-records?format=json',
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('data');
  });

  it('rejects export access without scope', async () => {
    const apiKey = await createApiKey(['read:analytics']);

    const response = await app.inject({
      method: 'GET',
      url: '/exports/cost-records?format=json',
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows read:alerts for alert listing', async () => {
    const apiKey = await createApiKey(['read:alerts']);

    const response = await app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects alert listing without scope', async () => {
    const apiKey = await createApiKey(['read:documents']);

    const response = await app.inject({
      method: 'GET',
      url: '/alerts',
      headers: { 'x-api-key': apiKey },
    });

    expect(response.statusCode).toBe(403);
  });
});
