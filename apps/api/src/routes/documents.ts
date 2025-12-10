/**
 * Document Routes
 *
 * HTTP layer for document operations.
 * Business logic is delegated to DocumentService.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { getAuditContext } from '../middleware/request-context.js';
import { documentService, type ServiceContext } from '../services/document.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getContext(request: FastifyRequest): ServiceContext {
  const ctx = getAuditContext(request);
  return {
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress || request.ip,
    userAgent: ctx.userAgent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export default async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /documents/upload
   */
  fastify.post(
    '/upload',
    {
      schema: {
        consumes: ['multipart/form-data'],
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              filename: { type: 'string' },
              originalFilename: { type: 'string' },
              mimeType: { type: 'string' },
              fileSize: { type: 'number' },
              extractionStatus: { type: 'string' },
              uploadedAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const data = await request.file();
      if (!data) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No file provided',
        });
      }

      const buffer = await data.toBuffer();

      const result = await documentService.upload(
        { buffer, filename: data.filename, mimetype: data.mimetype },
        request.user.sub,
        getContext(request),
        request.log
      );

      if (!result.success) {
        const response: Record<string, unknown> = {
          error: result.error,
          message: result.message,
        };
        if (result.details) {
          const details = result.details as Record<string, unknown>;
          if ('existingDocumentId' in details) {
            response['existingDocumentId'] = details['existingDocumentId'];
          } else {
            response['details'] = result.details;
          }
        }
        return reply.code(result.statusCode).send(response);
      }

      return reply.code(201).send(result.data);
    }
  );

  /**
   * GET /documents
   */
  fastify.get<{
    Querystring: { limit?: number; offset?: number; status?: string };
  }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 50, maximum: 100 },
            offset: { type: 'number', default: 0 },
            status: { type: 'string' },
          },
        },
      },
    },
    async (request, reply: FastifyReply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { limit = 50, offset = 0, status } = request.query;

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where: status ? { extractionStatus: status } : undefined,
          orderBy: { uploadedAt: 'desc' },
          take: limit,
          skip: offset,
          select: {
            id: true,
            filename: true,
            originalFilename: true,
            mimeType: true,
            fileSize: true,
            extractionStatus: true,
            verificationStatus: true,
            uploadedAt: true,
          },
        }),
        prisma.document.count({
          where: status ? { extractionStatus: status } : undefined,
        }),
      ]);

      return reply.send({
        data: documents,
        pagination: { total, limit, offset },
      });
    }
  );

  /**
   * GET /documents/:id
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    async (request, reply: FastifyReply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { id } = request.params;

      // Check access
      const accessResult = await documentService.checkAccess(
        id,
        request.user.sub,
        getContext(request),
        request.log
      );

      if (!accessResult.allowed) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Document not found',
        });
      }

      const document = await prisma.document.findUnique({
        where: { id },
        include: {
          costRecords: {
            select: {
              id: true,
              amount: true,
              costType: true,
              periodStart: true,
              periodEnd: true,
            },
          },
        },
      });

      if (!document) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Document not found',
        });
      }

      return reply.send(document);
    }
  );

  /**
   * GET /documents/:id/download
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/download',
    async (request, reply: FastifyReply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const result = await documentService.getDownloadUrl(
        request.params.id,
        request.user.sub,
        getContext(request),
        request.log
      );

      if (!result.success) {
        return reply.code(result.statusCode).send({
          error: result.error,
          message: result.message,
        });
      }

      return reply.send(result.data);
    }
  );

  /**
   * DELETE /documents/:id
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    async (request, reply: FastifyReply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const result = await documentService.delete(
        request.params.id,
        request.user.sub,
        getContext(request),
        request.log
      );

      if (!result.success) {
        return reply.code(result.statusCode).send({
          error: result.error,
          message: result.message,
        });
      }

      return reply.code(204).send();
    }
  );

  /**
   * POST /documents/:id/retry-extraction
   */
  fastify.post<{ Params: { id: string } }>(
    '/:id/retry-extraction',
    async (request, reply: FastifyReply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const result = await documentService.retryExtraction(
        request.params.id,
        request.user.sub,
        getContext(request),
        request.log
      );

      if (!result.success) {
        return reply.code(result.statusCode).send({
          error: result.error,
          message: result.message,
        });
      }

      return reply.send({
        success: true,
        message: result.data.message,
      });
    }
  );
}
