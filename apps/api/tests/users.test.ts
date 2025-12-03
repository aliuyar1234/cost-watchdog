import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import userRoutes from '../src/routes/users.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('User Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let viewerToken: string;
  let adminUserId: string;
  let viewerUserId: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(userRoutes, { prefix: '/users' });

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
    viewerUserId = viewer.id;

    const viewerTokens = await generateTokenPair({
      id: viewer.id,
      email: viewer.email,
      role: viewer.role,
    });
    viewerToken = viewerTokens.accessToken;
  });

  describe('GET /users', () => {
    it('returns list of users for admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(2);
      expect(body.pagination.total).toBe(2);
    });

    it('filters by role', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users?role=admin',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].role).toBe('admin');
    });

    it('rejects non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users',
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /users/:id', () => {
    it('returns user by id for admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/users/${viewerUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(viewerUserId);
      expect(body.email).toBe('viewer@test.com');
    });

    it('allows users to view their own profile', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/users/${viewerUserId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(viewerUserId);
    });

    it('rejects viewing other users for non-admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/users/${adminUserId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /users', () => {
    it('creates new user as admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'newuser@test.com',
          password: 'SecureP@ss123',
          firstName: 'New',
          lastName: 'User',
          role: 'analyst',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.email).toBe('newuser@test.com');
      expect(body.role).toBe('analyst');
    });

    it('rejects duplicate email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'admin@test.com',
          password: 'SecureP@ss123',
          firstName: 'Duplicate',
          lastName: 'User',
          role: 'viewer',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'weakpass@test.com',
          password: 'short',
          firstName: 'Weak',
          lastName: 'Password',
          role: 'viewer',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'incomplete@test.com',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects non-admin users', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          email: 'newuser@test.com',
          password: 'SecureP@ss123',
          firstName: 'New',
          lastName: 'User',
          role: 'viewer',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /users/:id', () => {
    it('updates user as admin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${viewerUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: 'Updated',
          role: 'analyst',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.firstName).toBe('Updated');
      expect(body.role).toBe('analyst');
    });

    it('allows users to update own name', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${viewerUserId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          firstName: 'MyNew',
          lastName: 'Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.firstName).toBe('MyNew');
      expect(body.lastName).toBe('Name');
    });

    it('rejects role change by non-admin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${viewerUserId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          role: 'admin',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('rejects updating other users by non-admin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${adminUserId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          firstName: 'Hacked',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/users/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { firstName: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /users/:id', () => {
    it('deactivates user as admin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/users/${viewerUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify user is deactivated
      const user = await prisma.user.findUnique({ where: { id: viewerUserId } });
      expect(user?.isActive).toBe(false);
    });

    it('prevents deleting own account', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/users/${adminUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects non-admin users', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/users/${adminUserId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/users/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /users/:id/reset-password', () => {
    it('resets password as admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/users/${viewerUserId}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: 'NewSecureP@ss456' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });

    it('rejects weak new password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/users/${viewerUserId}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: 'weak' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects non-admin users', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/users/${adminUserId}/reset-password`,
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: { newPassword: 'NewSecureP@ss456' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users/non-existent-id/reset-password',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: 'NewSecureP@ss456' },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
