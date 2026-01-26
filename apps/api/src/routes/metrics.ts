/**
 * Prometheus Metrics Route
 *
 * Exposes /metrics endpoint for Prometheus scraping.
 * This endpoint is unauthenticated for scraper access but should be
 * protected at the network level (internal network only).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetrics, getMetricsContentType } from '../lib/metrics.js';
import { timingSafeEqual } from 'crypto';

const METRICS_TOKEN = process.env['METRICS_TOKEN'];

function getBearerToken(authorizationHeader: string): string | null {
  const match = authorizationHeader.match(/^Bearer\\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function safeTokenEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export default async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /metrics
   * Prometheus metrics endpoint.
   *
   * NOTE: This endpoint is intentionally unauthenticated for Prometheus access.
   * It should be protected at the infrastructure level:
   * - Only accessible from internal network
   * - Not exposed through public load balancer
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
        },
        tags: ['Monitoring'],
        summary: 'Prometheus metrics',
        description: 'Returns metrics in Prometheus text format for scraping',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (METRICS_TOKEN) {
          const authorizationHeader = request.headers['authorization'];
          const token =
            typeof authorizationHeader === 'string' ? getBearerToken(authorizationHeader) : null;
          if (!token || !safeTokenEquals(token, METRICS_TOKEN)) {
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
