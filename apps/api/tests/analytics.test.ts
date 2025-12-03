import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import analyticsRoutes from '../src/routes/analytics.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

describe('Analytics Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;

  beforeEach(async () => {
    app = Fastify();
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(analyticsRoutes, { prefix: '/analytics' });

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

    // Create aggregation data
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    await prisma.costRecordMonthlyAgg.createMany({
      data: [
        {
          year: currentYear,
          month: currentMonth,
          costType: 'electricity',
          locationId: location.id,
          supplierId: supplier.id,
          amountSum: 5000,
          recordCount: 1,
        },
        {
          year: currentYear,
          month: currentMonth > 1 ? currentMonth - 1 : 12,
          costType: 'electricity',
          locationId: location.id,
          supplierId: supplier.id,
          amountSum: 4500,
          recordCount: 1,
        },
        {
          year: currentYear - 1,
          month: currentMonth,
          costType: 'electricity',
          locationId: location.id,
          supplierId: supplier.id,
          amountSum: 4000,
          recordCount: 1,
        },
      ],
    });

    return { org, location, supplier };
  }

  describe('GET /analytics/dashboard', () => {
    it('returns dashboard KPIs', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/dashboard',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('year');
      expect(body).toHaveProperty('totals');
      expect(body).toHaveProperty('anomalies');
      expect(body).toHaveProperty('documents');
      expect(body.totals).toHaveProperty('yearToDate');
      expect(body.totals).toHaveProperty('currentMonth');
    });

    it('accepts year parameter', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/dashboard?year=2023',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.year).toBe(2023);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/dashboard',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /analytics/trends', () => {
    it('returns cost trends', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/trends',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('accepts months parameter', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/trends?months=6',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBeLessThanOrEqual(6);
    });

    it('filters by cost type', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/trends?costType=electricity',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
    });
  });

  describe('GET /analytics/by-cost-type', () => {
    it('returns breakdown by cost type', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/by-cost-type',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      if (body.data.length > 0) {
        expect(body.data[0]).toHaveProperty('costType');
        expect(body.data[0]).toHaveProperty('amount');
        expect(body.data[0]).toHaveProperty('percentage');
      }
    });

    it('accepts year and month parameters', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/by-cost-type?year=2024&month=1',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /analytics/by-location', () => {
    it('returns breakdown by location', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/by-location',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      if (body.data.length > 0) {
        expect(body.data[0]).toHaveProperty('locationId');
        expect(body.data[0]).toHaveProperty('locationName');
        expect(body.data[0]).toHaveProperty('amount');
      }
    });
  });

  describe('GET /analytics/by-supplier', () => {
    it('returns breakdown by supplier', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/by-supplier',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      if (body.data.length > 0) {
        expect(body.data[0]).toHaveProperty('supplierId');
        expect(body.data[0]).toHaveProperty('supplierName');
        expect(body.data[0]).toHaveProperty('amount');
      }
    });
  });

  describe('GET /analytics/comparison', () => {
    it('returns year-over-year comparison', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/comparison',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('year');
      expect(body).toHaveProperty('months');
      expect(Array.isArray(body.months)).toBe(true);
      expect(body.months.length).toBe(12);
      expect(body.months[0]).toHaveProperty('month');
      expect(body.months[0]).toHaveProperty('currentYear');
      expect(body.months[0]).toHaveProperty('previousYear');
      expect(body.months[0]).toHaveProperty('change');
    });

    it('accepts year parameter', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/comparison?year=2023',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.year).toBe(2023);
    });

    it('filters by cost type', async () => {
      await createTestData();

      const response = await app.inject({
        method: 'GET',
        url: '/analytics/comparison?costType=electricity',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
