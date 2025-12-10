/**
 * Audit Logs Routes
 *
 * Provides endpoints for querying the audit trail.
 * Only accessible by admin and auditor roles.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { queryAuditLogs, getAuditLogById, auditLogQuerySchema } from '../lib/audit.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AuditLogQueryParams {
  entityType?: string;
  entityId?: string;
  action?: string;
  performedBy?: string;
  startDate?: string;
  endDate?: string;
  limit?: string;
  offset?: string;
}

interface AuditLogIdParams {
  id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE GUARD
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_ROLES = ['admin', 'auditor'];

async function requireAuditAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const userRole = request.user.role;
  if (!ALLOWED_ROLES.includes(userRole)) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Access to audit logs requires admin or auditor role',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export default async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /audit-logs
   * Query audit logs with filtering and pagination.
   */
  fastify.get<{ Querystring: AuditLogQueryParams }>(
    '/',
    {
      preHandler: [authenticate, requireAuditAccess],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            entityType: { type: 'string' },
            entityId: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            performedBy: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            limit: { type: 'string', pattern: '^[0-9]+$' },
            offset: { type: 'string', pattern: '^[0-9]+$' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    entityType: { type: 'string' },
                    entityId: { type: 'string' },
                    action: { type: 'string' },
                    before: { type: 'object', nullable: true },
                    after: { type: 'object', nullable: true },
                    changes: { type: 'object', nullable: true },
                    reason: { type: 'string', nullable: true },
                    metadata: { type: 'object', nullable: true },
                    performedBy: { type: 'string' },
                    performedAt: { type: 'string', format: 'date-time' },
                    requestId: { type: 'string', nullable: true },
                    ipAddress: { type: 'string', nullable: true },
                    userAgent: { type: 'string', nullable: true },
                  },
                },
              },
              total: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: AuditLogQueryParams }>, reply: FastifyReply) => {
      try {
        // Validate and parse query parameters
        const parseResult = auditLogQuerySchema.safeParse({
          ...request.query,
          limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
          offset: request.query.offset ? parseInt(request.query.offset, 10) : undefined,
        });

        if (!parseResult.success) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid query parameters',
            details: parseResult.error.errors,
          });
        }

        const result = await queryAuditLogs(parseResult.data);

        return reply.send(result);
      } catch (error) {
        request.log.error(error, 'Failed to query audit logs');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to query audit logs',
        });
      }
    }
  );

  /**
   * GET /audit-logs/:id
   * Get a single audit log entry by ID.
   */
  fastify.get<{ Params: AuditLogIdParams }>(
    '/:id',
    {
      preHandler: [authenticate, requireAuditAccess],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              entityType: { type: 'string' },
              entityId: { type: 'string' },
              action: { type: 'string' },
              before: { type: 'object', nullable: true },
              after: { type: 'object', nullable: true },
              changes: { type: 'object', nullable: true },
              reason: { type: 'string', nullable: true },
              metadata: { type: 'object', nullable: true },
              performedBy: { type: 'string' },
              performedAt: { type: 'string', format: 'date-time' },
              requestId: { type: 'string', nullable: true },
              ipAddress: { type: 'string', nullable: true },
              userAgent: { type: 'string', nullable: true },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: AuditLogIdParams }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const entry = await getAuditLogById(id);

        if (!entry) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Audit log entry not found',
          });
        }

        return reply.send(entry);
      } catch (error) {
        request.log.error(error, 'Failed to get audit log entry');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get audit log entry',
        });
      }
    }
  );
}
