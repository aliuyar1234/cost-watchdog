import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import metricsRoutes from '../src/routes/metrics.js';
import {
  getMetrics,
  getMetricsContentType,
  normalizePath,
  recordHttpRequest,
} from '../src/lib/metrics.js';

describe('Metrics Service', () => {
  describe('normalizePath', () => {
    it('should replace UUIDs with :id', () => {
      const path = '/api/v1/users/123e4567-e89b-12d3-a456-426614174000';
      const normalized = normalizePath(path);
      expect(normalized).toBe('/api/v1/users/:id');
    });

    it('should replace multiple UUIDs', () => {
      const path = '/api/v1/users/123e4567-e89b-12d3-a456-426614174000/sessions/987fcdeb-51a2-3bc4-d567-890123456789';
      const normalized = normalizePath(path);
      expect(normalized).toBe('/api/v1/users/:id/sessions/:id');
    });

    it('should replace numeric IDs', () => {
      const path = '/api/v1/items/12345';
      const normalized = normalizePath(path);
      expect(normalized).toBe('/api/v1/items/:id');
    });

    it('should remove query strings', () => {
      const path = '/api/v1/users?page=1&limit=10';
      const normalized = normalizePath(path);
      expect(normalized).toBe('/api/v1/users');
    });

    it('should handle paths without IDs', () => {
      const path = '/api/v1/health';
      const normalized = normalizePath(path);
      expect(normalized).toBe('/api/v1/health');
    });

    it('should handle root path', () => {
      const path = '/';
      const normalized = normalizePath(path);
      expect(normalized).toBe('/');
    });
  });

  describe('recordHttpRequest', () => {
    it('should not throw when recording request', () => {
      expect(() => {
        recordHttpRequest('GET', '/api/v1/health', 200, 50);
      }).not.toThrow();
    });

    it('should handle request with body sizes', () => {
      expect(() => {
        recordHttpRequest('POST', '/api/v1/documents', 201, 100, 1024, 512);
      }).not.toThrow();
    });

    it('should normalize paths in metrics', () => {
      expect(() => {
        recordHttpRequest(
          'GET',
          '/api/v1/users/123e4567-e89b-12d3-a456-426614174000',
          200,
          25
        );
      }).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus-formatted metrics', async () => {
      const metrics = await getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should include http_requests_total metric', async () => {
      // Record a request first
      recordHttpRequest('GET', '/test', 200, 10);

      const metrics = await getMetrics();
      expect(metrics).toContain('http_requests_total');
    });

    it('should include http_request_duration_seconds metric', async () => {
      const metrics = await getMetrics();
      expect(metrics).toContain('http_request_duration_seconds');
    });

    it('should include default Node.js metrics', async () => {
      const metrics = await getMetrics();
      expect(metrics).toContain('process_');
    });
  });

  describe('getMetricsContentType', () => {
    it('should return correct content type', () => {
      const contentType = getMetricsContentType();
      expect(contentType).toContain('text/plain');
    });
  });
});

describe('Metrics Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(metricsRoutes);
  });

  describe('GET /', () => {
    it('should return metrics without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return correct content type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should return Prometheus-formatted output', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      const body = response.body;
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });

    it('should include HTTP metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.body).toContain('http_requests_total');
      expect(response.body).toContain('http_request_duration_seconds');
    });

    it('should include business metrics definitions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.body).toContain('failed_login_attempts_total');
      expect(response.body).toContain('account_lockouts_total');
    });
  });
});
