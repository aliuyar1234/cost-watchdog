import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireScope } from '../../lib/api-key-scopes.js';
import { rateLimitEndpoint } from '../../lib/rate-limit.js';
import { documentService } from '../../services/document.service.js';
import { getDocumentServiceContext, requireDocumentUser } from './shared.js';

export async function registerDocumentWriteRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/upload',
    {
      preHandler: [requireScope('write:documents'), rateLimitEndpoint('upload')],
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
      const user = requireDocumentUser(request, reply);
      if (!user) {
        return;
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
        user.sub,
        getDocumentServiceContext(request),
        request.log,
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
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireScope('write:documents') },
    async (request, reply: FastifyReply) => {
      const user = requireDocumentUser(request, reply);
      if (!user) {
        return;
      }

      const result = await documentService.delete(
        request.params.id,
        user.sub,
        getDocumentServiceContext(request),
        request.log,
      );

      if (!result.success) {
        return reply.code(result.statusCode).send({
          error: result.error,
          message: result.message,
        });
      }

      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/retry-extraction',
    { preHandler: requireScope('write:documents') },
    async (request, reply: FastifyReply) => {
      const user = requireDocumentUser(request, reply);
      if (!user) {
        return;
      }

      const result = await documentService.retryExtraction(
        request.params.id,
        user.sub,
        getDocumentServiceContext(request),
        request.log,
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
    },
  );
}
