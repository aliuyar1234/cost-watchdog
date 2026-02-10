import type { FastifyInstance, FastifyReply } from 'fastify';
import { prisma } from '../../lib/db.js';
import { getAccessibleDocuments } from '../../lib/document-access.js';
import { requireScope } from '../../lib/api-key-scopes.js';
import { documentService } from '../../services/document.service.js';
import { getDocumentServiceContext, requireDocumentUser } from './shared.js';

export async function registerDocumentReadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { limit?: number; offset?: number; status?: string };
  }>(
    '/',
    {
      preHandler: requireScope('read:documents'),
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
      const user = requireDocumentUser(request, reply);
      if (!user) {
        return;
      }

      const { limit = 50, offset = 0, status } = request.query;
      const { documents, total } = await getAccessibleDocuments(user.sub, {
        limit,
        offset,
        orderBy: 'uploadedAt',
        order: 'desc',
        status,
      });

      const data = (
        documents as Array<{
          id: string;
          filename: string;
          originalFilename: string;
          mimeType: string;
          fileSize: number;
          extractionStatus: string;
          verificationStatus: string;
          uploadedAt: Date;
        }>
      ).map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        originalFilename: doc.originalFilename,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        extractionStatus: doc.extractionStatus,
        verificationStatus: doc.verificationStatus,
        uploadedAt: doc.uploadedAt,
      }));

      return reply.send({
        data,
        pagination: { total, limit, offset },
      });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireScope('read:documents') },
    async (request, reply: FastifyReply) => {
      const user = requireDocumentUser(request, reply);
      if (!user) {
        return;
      }

      const { id } = request.params;
      const accessResult = await documentService.checkAccess(
        id,
        user.sub,
        getDocumentServiceContext(request),
        request.log,
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
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id/download',
    { preHandler: requireScope('read:documents') },
    async (request, reply: FastifyReply) => {
      const user = requireDocumentUser(request, reply);
      if (!user) {
        return;
      }

      const result = await documentService.getDownloadUrl(
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

      return reply.send(result.data);
    },
  );
}
