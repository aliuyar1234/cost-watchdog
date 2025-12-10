/**
 * Request ID Tracking Tests
 *
 * Tests for US7: Every request has a unique ID that flows through logs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import requestContextPlugin from '../src/middleware/request-context.js';
import {
  generateRequestId,
  isValidRequestId,
  extractOrGenerateRequestId,
  REQUEST_ID_HEADER,
} from '../src/lib/request-id.js';

describe('Request ID Tracking', () => {
  describe('generateRequestId', () => {
    it('should generate a UUID format ID', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('isValidRequestId', () => {
    it('should accept valid UUID', () => {
      expect(isValidRequestId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should accept valid alphanumeric ID', () => {
      expect(isValidRequestId('abcd1234efgh5678')).toBe(true);
      expect(isValidRequestId('ABC123-DEF456-GHI789')).toBe(true);
    });

    it('should reject too short IDs', () => {
      expect(isValidRequestId('abc123')).toBe(false);
    });

    it('should reject too long IDs', () => {
      expect(isValidRequestId('a'.repeat(65))).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(isValidRequestId('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidRequestId(null as unknown as string)).toBe(false);
      expect(isValidRequestId(undefined as unknown as string)).toBe(false);
    });

    it('should reject IDs with invalid characters', () => {
      expect(isValidRequestId('abc$123%def!456')).toBe(false);
      expect(isValidRequestId('hello world test')).toBe(false);
    });
  });

  describe('extractOrGenerateRequestId', () => {
    it('should extract valid X-Request-ID header', () => {
      const headers = { 'x-request-id': '550e8400-e29b-41d4-a716-446655440000' };
      const id = extractOrGenerateRequestId(headers);
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should handle array header value', () => {
      const headers = { 'x-request-id': ['550e8400-e29b-41d4-a716-446655440000', 'ignored'] };
      const id = extractOrGenerateRequestId(headers);
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should generate new ID for missing header', () => {
      const headers = {};
      const id = extractOrGenerateRequestId(headers);
      expect(isValidRequestId(id)).toBe(true);
    });

    it('should generate new ID for invalid header', () => {
      const headers = { 'x-request-id': 'invalid!@#$' };
      const id = extractOrGenerateRequestId(headers);
      expect(id).not.toBe('invalid!@#$');
      expect(isValidRequestId(id)).toBe(true);
    });
  });

  describe('Request Context Middleware', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      await app.register(requestContextPlugin);

      // Test route that returns request context
      app.get('/test', async (request, reply) => {
        return {
          requestId: request.requestContext?.requestId,
          ipAddress: request.requestContext?.ipAddress,
          userAgent: request.requestContext?.userAgent,
        };
      });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should generate X-Request-ID in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      const requestId = response.headers['x-request-id'];
      expect(requestId).toBeDefined();
      expect(isValidRequestId(requestId as string)).toBe(true);
    });

    it('should propagate incoming X-Request-ID', async () => {
      const incomingId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-request-id': incomingId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-request-id']).toBe(incomingId);

      const body = JSON.parse(response.payload);
      expect(body.requestId).toBe(incomingId);
    });

    it('should populate request context with IP address', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.ipAddress).toBe('192.168.1.100');
    });

    it('should populate request context with user agent', async () => {
      const userAgent = 'TestClient/1.0';
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'user-agent': userAgent,
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.userAgent).toBe(userAgent);
    });

    it('should use X-Real-IP when X-Forwarded-For is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-real-ip': '203.0.113.50',
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.ipAddress).toBe('203.0.113.50');
    });
  });

  describe('Request ID in Audit Logs', () => {
    it('should store request ID in audit log entries', async () => {
      // Import the audit module
      const { logAuditEvent } = await import('../src/lib/audit.js');
      const { randomUUID } = await import('crypto');

      const testRequestId = '550e8400-e29b-41d4-a716-446655440000';
      const testEntityId = randomUUID();
      const testPerformerId = randomUUID();

      const entry = await logAuditEvent({
        entityType: 'system',
        entityId: testEntityId,
        action: 'verify',
        metadata: { test: true },
        performedBy: testPerformerId,
        requestId: testRequestId,
        ipAddress: '127.0.0.1',
        userAgent: 'Test/1.0',
      });

      expect(entry.requestId).toBe(testRequestId);
      expect(entry.ipAddress).toBe('127.0.0.1');
      expect(entry.userAgent).toBe('Test/1.0');
    });
  });
});
