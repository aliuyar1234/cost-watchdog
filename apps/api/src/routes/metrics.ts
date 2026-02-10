/**
 * Prometheus Metrics Route
 *
 * Exposes /metrics endpoint for Prometheus scraping.
 * In production, this endpoint requires METRICS_TOKEN (or Docker secret
 * metrics_token) and fails closed if token is missing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetrics, getMetricsContentType } from '../lib/metrics.js';
import { timingSafeEqual } from 'crypto';
import { readSecret } from '../lib/secrets.js';

function getBearerToken(authorizationHeader: string): string | null {
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function safeTokenEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export default async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const metricsToken = readSecret('metrics_token', 'METRICS_TOKEN');

  if (isProduction && !metricsToken) {
    fastify.log.error(
      'METRICS_TOKEN (or /run/secrets/metrics_token) missing in production; /metrics is disabled',
    );
  }

  /**
   * GET /metrics
   * Prometheus metrics endpoint.
   *
   * - Production: requires bearer token and fails closed if token is missing.
   * - Non-production: unauthenticated by default unless METRICS_TOKEN is configured.
   */
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: {
            type: 'string',
          },
          401: {
            type: 'string',
          },
          503: {
            type: 'string',
          },
        },
        tags: ['Monitoring'],
        summary: 'Prometheus metrics',
        description: 'Returns metrics in Prometheus text format for scraping',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (isProduction && !metricsToken) {
          return reply.code(503).send('Metrics endpoint is disabled');
        }

        if (metricsToken) {
          const authorizationHeader = request.headers['authorization'];
          const token =
            typeof authorizationHeader === 'string' ? getBearerToken(authorizationHeader) : null;
          if (!token || !safeTokenEquals(token, metricsToken)) {
            return reply.code(401).send('Unauthorized');
          }
        }

        const metrics = await getMetrics();
        return reply.header('Content-Type', getMetricsContentType()).send(metrics);
      } catch (error) {
        request.log.error(error, 'Failed to collect metrics');
        return reply.code(500).send('Error collecting metrics');
      }
    },
  );
}
