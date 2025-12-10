/**
 * Prometheus Metrics Route
 *
 * Exposes /metrics endpoint for Prometheus scraping.
 * This endpoint is unauthenticated for scraper access but should be
 * protected at the network level (internal network only).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetrics, getMetricsContentType } from '../lib/metrics.js';

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
        },
        tags: ['Monitoring'],
        summary: 'Prometheus metrics',
        description: 'Returns metrics in Prometheus text format for scraping',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await getMetrics();
        return reply
          .header('Content-Type', getMetricsContentType())
          .send(metrics);
      } catch (error) {
        request.log.error(error, 'Failed to collect metrics');
        return reply.code(500).send('Error collecting metrics');
      }
    }
  );
}
