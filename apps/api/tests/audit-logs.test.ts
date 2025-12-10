import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { prisma } from './setup';
import auditLogRoutes from '../src/routes/audit-logs.js';
import authPlugin from '../src/middleware/auth.js';
import { generateAccessToken } from '../src/lib/auth.js';
import { logAuditEvent } from '../src/lib/audit.js';

describe('Audit Logs Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let auditorToken: string;
  let viewerToken: string;
  let adminUser: { id: string; email: string };
  let auditorUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(auditLogRoutes, { prefix: '/audit-logs' });

    // Create test users
    adminUser = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@example.com`,
        passwordHash: 'placeholder',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
    });

    auditorUser = await prisma.user.create({
      data: {
        email: `auditor-${Date.now()}@example.com`,
        passwordHash: 'placeholder',
        firstName: 'Auditor',
        lastName: 'User',
        role: 'auditor',
      },
    });

    viewerUser = await prisma.user.create({
      data: {
        email: `viewer-${Date.now()}@example.com`,
        passwordHash: 'placeholder',
        firstName: 'Viewer',
        lastName: 'User',
        role: 'viewer',
      },
    });

    adminToken = await generateAccessToken({
      sub: adminUser.id,
      email: adminUser.email,
      role: 'admin',
    });

    auditorToken = await generateAccessToken({
      sub: auditorUser.id,
      email: auditorUser.email,
      role: 'auditor',
    });

    viewerToken = await generateAccessToken({
      sub: viewerUser.id,
      email: viewerUser.email,
      role: 'viewer',
    });

    // Create some audit logs
    await logAuditEvent({
      entityType: 'user',
      entityId: adminUser.id,
      action: 'login',
      performedBy: adminUser.id,
    });

    await logAuditEvent({
      entityType: 'user',
      entityId: viewerUser.id,
      action: 'create',
      performedBy: adminUser.id,
    });
  });

  describe('GET /audit-logs', () => {
    it('should allow admin to query audit logs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it('should allow auditor to query audit logs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${auditorToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeDefined();
    });

    it('should deny viewer access to audit logs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${viewerToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should deny unauthenticated access', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should support filtering by entityType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs?entityType=user',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.every((log: { entityType: string }) => log.entityType === 'user')).toBe(true);
    });

    it('should support filtering by action', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs?action=login',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.every((log: { action: string }) => log.action === 'login')).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs?limit=1&offset=0',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(0);
    });

    it('should support date range filtering', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // 1 hour ago

      const response = await app.inject({
        method: 'GET',
        url: `/audit-logs?startDate=${startDate}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /audit-logs/:id', () => {
    it('should return audit log by id for admin', async () => {
      // First get a log id
      const listResponse = await app.inject({
        method: 'GET',
        url: '/audit-logs?limit=1',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      const logs = listResponse.json();
      const logId = logs.data[0].id;

      const response = await app.inject({
        method: 'GET',
        url: `/audit-logs/${logId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(logId);
    });

    it('should return audit log by id for auditor', async () => {
      const listResponse = await app.inject({
        method: 'GET',
        url: '/audit-logs?limit=1',
        headers: {
          authorization: `Bearer ${auditorToken}`,
        },
      });

      const logs = listResponse.json();
      const logId = logs.data[0].id;

      const response = await app.inject({
        method: 'GET',
        url: `/audit-logs/${logId}`,
        headers: {
          authorization: `Bearer ${auditorToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny viewer access to single audit log', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${viewerToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent log', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/audit-logs/invalid-uuid',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      // Fastify schema validation returns 400 for invalid UUID format
      expect(response.statusCode).toBe(400);
    });
  });
});
