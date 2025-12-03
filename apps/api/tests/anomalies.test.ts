import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import anomalyRoutes from '../src/routes/anomalies.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('Anomaly Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let testUserId: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(anomalyRoutes, { prefix: '/anomalies' });

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
    testUserId = user.id;

    const { accessToken } = await generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    adminToken = accessToken;
  });

  describe('GET /anomalies', () => {
    it('returns empty list when no anomalies exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/anomalies',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('returns anomalies with pagination', async () => {
      // Create test data
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

      await prisma.anomaly.create({
        data: {
          costRecordId: costRecord.id,
          type: 'yoy_deviation',
          severity: 'warning',
          status: 'new',
          message: 'YoY increase of 25%',
          details: { deviationPercent: 25 },
          isBackfill: false,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/anomalies',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].type).toBe('yoy_deviation');
      expect(body.data[0].severity).toBe('warning');
    });

    it('filters by status', async () => {
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

      await prisma.anomaly.createMany({
        data: [
          {
            costRecordId: costRecord.id,
            type: 'yoy_deviation',
            severity: 'warning',
            status: 'new',
            message: 'New anomaly',
            details: {},
            isBackfill: false,
          },
          {
            costRecordId: costRecord.id,
            type: 'mom_deviation',
            severity: 'info',
            status: 'acknowledged',
            message: 'Acknowledged anomaly',
            details: {},
            isBackfill: false,
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/anomalies?status=new',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].status).toBe('new');
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/anomalies',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /anomalies/stats', () => {
    it('returns aggregated statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/anomalies/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('byStatus');
      expect(body).toHaveProperty('bySeverity');
      expect(body).toHaveProperty('byType');
      expect(body).toHaveProperty('newLast24h');
    });
  });

  describe('GET /anomalies/:id', () => {
    it('returns single anomaly by id', async () => {
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
          severity: 'critical',
          status: 'new',
          message: 'Critical increase',
          details: { deviationPercent: 50 },
          isBackfill: false,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/anomalies/${anomaly.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(anomaly.id);
      expect(body.severity).toBe('critical');
    });

    it('returns 404 for non-existent anomaly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/anomalies/non-existent-id',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /anomalies/:id/acknowledge', () => {
    it('acknowledges an anomaly', async () => {
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

      const response = await app.inject({
        method: 'POST',
        url: `/anomalies/${anomaly.id}/acknowledge`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { resolution: 'Reviewed and accepted' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('acknowledged');
      expect(body.acknowledgedBy).toBe(testUserId);
    });
  });

  describe('POST /anomalies/:id/resolve', () => {
    it('resolves an anomaly', async () => {
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
          status: 'acknowledged',
          message: 'Test anomaly',
          details: {},
          isBackfill: false,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/anomalies/${anomaly.id}/resolve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { resolution: 'Issue fixed' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('resolved');
    });
  });

  describe('POST /anomalies/:id/false-positive', () => {
    it('marks anomaly as false positive', async () => {
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

      const response = await app.inject({
        method: 'POST',
        url: `/anomalies/${anomaly.id}/false-positive`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { resolution: 'Normal seasonal variation' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('false_positive');
    });
  });

  describe('PATCH /anomalies/:id', () => {
    it('updates anomaly status', async () => {
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

      const response = await app.inject({
        method: 'PATCH',
        url: `/anomalies/${anomaly.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'resolved', resolution: 'Fixed' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('resolved');
    });
  });
});
