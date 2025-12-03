import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import exportRoutes from '../src/routes/exports.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('Export Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(exportRoutes, { prefix: '/exports' });

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

  async function createTestData() {
    const org = await prisma.organization.create({
      data: { name: 'Test Org', legalName: 'Test GmbH' },
    });

    const location = await prisma.location.create({
      data: {
        organizationId: org.id,
        name: 'HQ Berlin',
        address: { country: 'DE', city: 'Berlin' },
        type: 'office',
        ownershipType: 'leased',
      },
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: 'Vattenfall',
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
        amount: 1500.50,
        amountNet: 1261.34,
        vatAmount: 239.16,
        quantity: 5000,
        unit: 'kWh',
        pricePerUnit: 0.3001,
        costType: 'electricity',
        currency: 'EUR',
        invoiceNumber: 'INV-2024-001',
      },
    });

    const anomaly = await prisma.anomaly.create({
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

    // Create aggregation data
    await prisma.costRecordMonthlyAgg.create({
      data: {
        year: 2024,
        month: 1,
        costType: 'electricity',
        locationId: location.id,
        supplierId: supplier.id,
        amountSum: 1500.50,
        recordCount: 1,
      },
    });

    return { org, location, supplier, costRecord, anomaly };
  }

  describe('GET /exports/cost-records', () => {
    it('exports cost records as CSV', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/cost-records?format=csv',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');

      const csv = response.body;
      expect(csv).toContain('ID');
      expect(csv).toContain('Periodenstart');
      expect(csv).toContain('Vattenfall');
      expect(csv).toContain('HQ Berlin');
    });

    it('exports cost records as JSON', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/cost-records?format=json',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('exportedAt');
      expect(body).toHaveProperty('recordCount');
      expect(body.data.length).toBe(1);
      expect(body.data[0].costType).toBe('electricity');
      expect(body.data[0].supplier).toBe('Vattenfall');
    });

    it('filters by year and month', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/cost-records?format=json&year=2024&month=1',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
    });

    it('filters by cost type', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/cost-records?format=json&costType=electricity',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.every((r: { costType: string }) => r.costType === 'electricity')).toBe(true);
    });

    it('returns empty data when no records match', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/cost-records?format=json&costType=gas',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual([]);
      expect(body.recordCount).toBe(0);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/cost-records',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /exports/anomalies', () => {
    it('exports anomalies as CSV', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/anomalies?format=csv',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');

      const csv = response.body;
      expect(csv).toContain('ID');
      expect(csv).toContain('Schweregrad');
      expect(csv).toContain('warning');
    });

    it('exports anomalies as JSON', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/anomalies?format=json',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(body.data.length).toBe(1);
      expect(body.data[0].type).toBe('yoy_deviation');
      expect(body.data[0].severity).toBe('warning');
    });

    it('filters by status', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/anomalies?format=json&status=new',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.every((a: { status: string }) => a.status === 'new')).toBe(true);
    });

    it('filters by severity', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/anomalies?format=json&severity=warning',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.every((a: { severity: string }) => a.severity === 'warning')).toBe(true);
    });
  });

  describe('GET /exports/monthly-report', () => {
    it('generates monthly report', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/exports/monthly-report?year=2024&month=1',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('period');
      expect(body.period.year).toBe(2024);
      expect(body.period.month).toBe(1);
      expect(body).toHaveProperty('summary');
      expect(body.summary).toHaveProperty('totalAmount');
      expect(body.summary).toHaveProperty('anomalyCount');
      expect(body).toHaveProperty('byCostType');
      expect(body).toHaveProperty('byLocation');
      expect(body).toHaveProperty('bySupplier');
      expect(body).toHaveProperty('generatedAt');
    });

    it('requires year and month parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/monthly-report',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns zero totals for empty months', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/monthly-report?year=2020&month=1',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.summary.totalAmount).toBe(0);
    });
  });
});
