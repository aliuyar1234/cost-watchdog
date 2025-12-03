import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import alertRoutes from '../src/routes/alerts.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('Alert Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(alertRoutes, { prefix: '/alerts' });

    // Create admin user
    const user = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: 'placeholder',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
    });

    const { accessToken } = await generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    adminToken = accessToken;
  });

  async function createTestAlert() {
    const org = await prisma.organization.create({
      data: { name: 'Test Org', legalName: 'Test GmbH' },
    });

    const location = await prisma.location.create({
      data: {
        organizationId: org.id,
        name: 'HQ',
        address: { country: 'DE' },
        type: 'office',
        ownershipType: 'leased',
      },
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: 'TestSupplier',
        category: 'energy_electricity',
        costTypes: ['electricity'],
      },
    });

    const costRecord = await prisma.costRecord.create({
      data: {
        supplierId: supplier.id,
        locationId: location.id,
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31'),
        amount: 1000,
        costType: 'electricity',
        currency: 'EUR',
      },
    });

    const anomaly = await prisma.anomaly.create({
      data: {
        costRecordId: costRecord.id,
        type: 'yoy_deviation',
        severity: 'warning',
        status: 'new',
        message: 'Test anomaly',
        details: {},
        isBackfill: false,
      },
    });

    const alert = await prisma.alert.create({
      data: {
        anomalyId: anomaly.id,
        channel: 'email',
        recipient: 'test@example.com',
        subject: 'Test Alert',
        body: 'Test alert body content',
        status: 'sent',
        sentAt: new Date(),
      },
    });

    return { anomaly, alert };
  }

  describe('GET /alerts', () => {
    it('returns empty list when no alerts exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/alerts',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('returns alerts with pagination', async () => {
      await createTestAlert();

      const response = await app.inject({
        method: 'GET',
        url: '/alerts',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].channel).toBe('email');
      expect(body.data[0].status).toBe('sent');
    });

    it('filters by status', async () => {
      const { anomaly } = await createTestAlert();

      // Use 'slack' channel to avoid unique constraint with email alert from createTestAlert
      await prisma.alert.create({
        data: {
          anomalyId: anomaly.id,
          channel: 'slack',
          recipient: '#alerts-failed',
          subject: 'Failed Alert',
          body: 'Failed alert body',
          status: 'failed',
          errorMessage: 'Connection timeout',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/alerts?status=failed',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].status).toBe('failed');
    });

    it('filters by channel', async () => {
      const { anomaly } = await createTestAlert();

      await prisma.alert.create({
        data: {
          anomalyId: anomaly.id,
          channel: 'slack',
          recipient: '#alerts',
          subject: 'Slack Alert',
          body: 'Slack alert body',
          status: 'sent',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/alerts?channel=slack',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].channel).toBe('slack');
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/alerts',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /alerts/stats', () => {
    it('returns aggregated statistics', async () => {
      await createTestAlert();

      const response = await app.inject({
        method: 'GET',
        url: '/alerts/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('byStatus');
      expect(body).toHaveProperty('byChannel');
      expect(body).toHaveProperty('last24h');
      expect(body).toHaveProperty('last7d');
    });
  });

  describe('GET /alerts/:id', () => {
    it('returns single alert by id', async () => {
      const { alert } = await createTestAlert();

      const response = await app.inject({
        method: 'GET',
        url: `/alerts/${alert.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(alert.id);
      expect(body.channel).toBe('email');
    });

    it('returns 404 for non-existent alert', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/alerts/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /alerts/:id/track-click', () => {
    it('tracks click without authentication', async () => {
      const { alert } = await createTestAlert();

      const response = await app.inject({
        method: 'POST',
        url: `/alerts/${alert.id}/track-click`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);

      // Verify click was recorded
      const updated = await prisma.alert.findUnique({ where: { id: alert.id } });
      expect(updated?.clickedAt).not.toBeNull();
    });

    it('returns 404 for non-existent alert', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alerts/non-existent-id/track-click',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /alerts/:id/retry', () => {
    it('retries a failed alert', async () => {
      const { anomaly } = await createTestAlert();

      // Use 'slack' channel to avoid unique constraint with email alert from createTestAlert
      const failedAlert = await prisma.alert.create({
        data: {
          anomalyId: anomaly.id,
          channel: 'slack',
          recipient: '#alerts-retry',
          subject: 'Failed Alert',
          body: 'Failed alert body for retry',
          status: 'failed',
          errorMessage: 'Connection timeout',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/alerts/${failedAlert.id}/retry`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('pending');
      expect(body.errorMessage).toBeNull();
    });

    it('rejects retry for non-failed alert', async () => {
      const { alert } = await createTestAlert();

      const response = await app.inject({
        method: 'POST',
        url: `/alerts/${alert.id}/retry`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('requires authentication', async () => {
      const { anomaly } = await createTestAlert();

      // Use 'teams' channel to avoid unique constraint with email alert from createTestAlert
      const failedAlert = await prisma.alert.create({
        data: {
          anomalyId: anomaly.id,
          channel: 'teams',
          recipient: 'teams-webhook-url',
          subject: 'Failed Alert',
          body: 'Failed alert body for auth test',
          status: 'failed',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/alerts/${failedAlert.id}/retry`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
