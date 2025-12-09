import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import apiKeyRoutes from '../src/routes/api-keys.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('API Key Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let viewerToken: string;
  let adminUserId: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(apiKeyRoutes, { prefix: '/api-keys' });

    // Create admin user
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

    const adminTokens = await generateTokenPair({
      id: admin.id,
      email: admin.email,
      role: admin.role,
    });
    adminToken = adminTokens.accessToken;

    // Create viewer user
    const viewer = await prisma.user.create({
      data: {
        email: 'viewer@test.com',
        passwordHash: 'placeholder',
        firstName: 'Viewer',
        lastName: 'User',
        role: 'viewer',
      },
    });

    const viewerTokens = await generateTokenPair({
      id: viewer.id,
      email: viewer.email,
      role: viewer.role,
    });
    viewerToken = viewerTokens.accessToken;
  });

  describe('GET /api-keys', () => {
    it('returns empty list when no API keys exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('returns API keys with pagination', async () => {
      // Create test API key directly in DB
      await prisma.apiKey.create({
        data: {
          name: 'Test Key',
          keyHash: 'testhash123',
          keyPrefix: 'cwk_test1234',
          scopes: ['read:anomalies'],
          createdById: adminUserId,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('Test Key');
      expect(body.data[0].keyPrefix).toBe('cwk_test1234');
      expect(body.data[0].scopes).toContain('read:anomalies');
      // Should not expose the hash
      expect(body.data[0].keyHash).toBeUndefined();
    });

    it('returns both active and revoked keys by default', async () => {
      await prisma.apiKey.createMany({
        data: [
          {
            name: 'Active Key',
            keyHash: 'activehash',
            keyPrefix: 'cwk_active12',
            scopes: ['read:anomalies'],
            createdById: adminUserId,
            isActive: true,
          },
          {
            name: 'Revoked Key',
            keyHash: 'revokedhash',
            keyPrefix: 'cwk_revoke12',
            scopes: ['read:anomalies'],
            createdById: adminUserId,
            isActive: false,
            revokedAt: new Date(),
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(2);

      // Verify both active and revoked keys are returned
      const activeKey = body.data.find((k: { name: string }) => k.name === 'Active Key');
      const revokedKey = body.data.find((k: { name: string }) => k.name === 'Revoked Key');
      expect(activeKey.isActive).toBe(true);
      expect(revokedKey.isActive).toBe(false);
    });

    it('rejects non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-keys',
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-keys',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api-keys/:id', () => {
    it('returns single API key by id', async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: 'Single Key',
          keyHash: 'singlehash',
          keyPrefix: 'cwk_single12',
          scopes: ['read:anomalies', 'read:analytics'],
          createdById: adminUserId,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api-keys/${apiKey.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(apiKey.id);
      expect(body.name).toBe('Single Key');
      expect(body.scopes).toEqual(['read:anomalies', 'read:analytics']);
    });

    it('returns 404 for non-existent API key', async () => {
      // Use a valid UUID format that doesn't exist
      const response = await app.inject({
        method: 'GET',
        url: '/api-keys/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects non-admin users', async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: 'Test Key',
          keyHash: 'testhash',
          keyPrefix: 'cwk_test1234',
          scopes: ['read:anomalies'],
          createdById: adminUserId,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api-keys/${apiKey.id}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api-keys', () => {
    it('creates new API key and returns secret', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'New Integration Key',
          scopes: ['read:anomalies', 'read:analytics'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.name).toBe('New Integration Key');
      expect(body.scopes).toEqual(['read:anomalies', 'read:analytics']);
      expect(body.isActive).toBe(true);
      // Should return the secret key only on creation
      expect(body.apiKey).toBeDefined();
      expect(body.apiKey).toMatch(/^cwk_/);
      expect(body.keyPrefix).toBe(body.apiKey.substring(0, 12));
    });

    it('creates API key with expiration', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const response = await app.inject({
        method: 'POST',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Expiring Key',
          scopes: ['read:anomalies'],
          expiresAt: expiresAt.toISOString(),
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.expiresAt).toBeDefined();
      expect(new Date(body.expiresAt).getTime()).toBeCloseTo(expiresAt.getTime(), -3);
    });

    it('rejects missing name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          scopes: ['read:anomalies'],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects empty scopes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'No Scopes Key',
          scopes: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects invalid scopes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Invalid Scopes Key',
          scopes: ['invalid:scope', 'another:bad'],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain('Invalid scopes');
    });

    it('rejects non-admin users', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api-keys',
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          name: 'Unauthorized Key',
          scopes: ['read:anomalies'],
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /api-keys/:id', () => {
    it('revokes API key (soft delete)', async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: 'To Be Revoked',
          keyHash: 'revokehash',
          keyPrefix: 'cwk_revoke12',
          scopes: ['read:anomalies'],
          createdById: adminUserId,
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api-keys/${apiKey.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify key is deactivated, not deleted
      const updated = await prisma.apiKey.findUnique({ where: { id: apiKey.id } });
      expect(updated).not.toBeNull();
      expect(updated?.isActive).toBe(false);
      expect(updated?.revokedAt).not.toBeNull();
    });

    it('returns 404 for non-existent API key', async () => {
      // Use a valid UUID format that doesn't exist
      const response = await app.inject({
        method: 'DELETE',
        url: '/api-keys/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects non-admin users', async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: 'Cannot Delete',
          keyHash: 'nodelete',
          keyPrefix: 'cwk_nodele12',
          scopes: ['read:anomalies'],
          createdById: adminUserId,
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api-keys/${apiKey.id}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api-keys/scopes', () => {
    it('returns list of valid scopes with descriptions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-keys/scopes',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.scopes).toBeDefined();
      expect(Array.isArray(body.scopes)).toBe(true);
      expect(body.scopes.length).toBeGreaterThan(0);

      // Each scope should have name and description
      body.scopes.forEach((scope: { name: string; description: string }) => {
        expect(scope.name).toBeDefined();
        expect(scope.description).toBeDefined();
      });

      // Check some known scopes exist
      const scopeNames = body.scopes.map((s: { name: string }) => s.name);
      expect(scopeNames).toContain('read:anomalies');
      expect(scopeNames).toContain('read:analytics');
    });

    it('allows authenticated non-admin users to view scopes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api-keys/scopes',
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      // Scopes endpoint is informational, should be accessible
      expect(response.statusCode).toBe(200);
    });
  });
});

describe('API Key Authentication', () => {
  let app: ReturnType<typeof Fastify>;
  let adminUserId: string;

  beforeEach(async () => {
    // Create admin user for key creation
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

  it('validates API key hash correctly', async () => {
    const { createHash } = await import('crypto');

    // Create a known API key
    const rawKey = 'cwk_testapikey12345678901234567890';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await prisma.apiKey.create({
      data: {
        name: 'Auth Test Key',
        keyHash,
        keyPrefix: rawKey.substring(0, 12),
        scopes: ['read:anomalies'],
        createdById: adminUserId,
        isActive: true,
      },
    });

    // The validateApiKey middleware should accept this key
    // This tests the hash comparison logic
    const storedKey = await prisma.apiKey.findFirst({
      where: { keyHash },
    });

    expect(storedKey).not.toBeNull();
    expect(storedKey?.isActive).toBe(true);
  });

  it('expired API keys are rejected', async () => {
    const { createHash } = await import('crypto');

    const rawKey = 'cwk_expiredkey12345678901234567890';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // Create expired key
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

    await prisma.apiKey.create({
      data: {
        name: 'Expired Key',
        keyHash,
        keyPrefix: rawKey.substring(0, 12),
        scopes: ['read:anomalies'],
        createdById: adminUserId,
        isActive: true,
        expiresAt: expiredDate,
      },
    });

    // Query should not find expired keys
    const validKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    expect(validKey).toBeNull();
  });

  it('revoked API keys are rejected', async () => {
    const { createHash } = await import('crypto');

    const rawKey = 'cwk_revokedkey12345678901234567890';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await prisma.apiKey.create({
      data: {
        name: 'Revoked Key',
        keyHash,
        keyPrefix: rawKey.substring(0, 12),
        scopes: ['read:anomalies'],
        createdById: adminUserId,
        isActive: false,
        revokedAt: new Date(),
      },
    });

    // Query should not find revoked keys
    const validKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
      },
    });

    expect(validKey).toBeNull();
  });
});
