import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db.js';
import {
  uploadFile,
  deleteFile,
  generateStoragePath,
  calculateFileHash,
  getPresignedDownloadUrl,
} from '../lib/s3.js';
import { authenticate } from '../middleware/auth.js';

/**
 * Allowed MIME types for document upload.
 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'image/png',
  'image/jpeg',
];

/**
 * Maximum file size (10MB).
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Document routes plugin.
 */
export default async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth to all routes
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

      if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        });
      }

      const buffer = await data.toBuffer();

      if (buffer.length > MAX_FILE_SIZE) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        });
      }

      const fileHash = calculateFileHash(buffer);

      // Check for duplicate
      const existingDoc = await prisma.document.findUnique({
        where: { fileHash },
      });

      if (existingDoc) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Document with identical content already exists',
          existingDocumentId: existingDoc.id,
        });
      }

      // Generate storage path
      const storagePath = generateStoragePath(data.filename);

      try {
        await uploadFile(storagePath, buffer, data.mimetype);
      } catch (error) {
        request.log.error(error, 'Failed to upload file to S3');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to store document',
        });
      }

      // Create document and outbox event in transaction
      const document = await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            filename: storagePath.split('/').pop() || data.filename,
            originalFilename: data.filename,
            mimeType: data.mimetype,
            fileSize: buffer.length,
            fileHash,
            storagePath,
            extractionStatus: 'pending',
            verificationStatus: 'pending',
            uploadedBy: request.user!.sub,
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'document',
            aggregateId: doc.id,
            eventType: 'document.uploaded',
            payload: {
              documentId: doc.id,
              filename: doc.originalFilename,
              mimeType: doc.mimeType,
              storagePath: doc.storagePath,
            },
          },
        });

        return doc;
      });

      return reply.code(201).send({
        id: document.id,
        filename: document.filename,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        extractionStatus: document.extractionStatus,
        uploadedAt: document.uploadedAt.toISOString(),
      });
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

      const { id } = request.params;

      const document = await prisma.document.findUnique({
        where: { id },
        select: { storagePath: true, originalFilename: true },
      });

      if (!document) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Document not found',
        });
      }

      try {
        const downloadUrl = await getPresignedDownloadUrl(document.storagePath);
        return reply.send({
          downloadUrl,
          filename: document.originalFilename,
          expiresIn: 3600,
        });
      } catch (error) {
        request.log.error(error, 'Failed to generate presigned URL');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to generate download URL',
        });
      }
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

      const { id } = request.params;

      const document = await prisma.document.findUnique({
        where: { id },
        select: {
          id: true,
          storagePath: true,
          _count: { select: { costRecords: true } },
        },
      });

      if (!document) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Document not found',
        });
      }

      if (document._count.costRecords > 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Cannot delete document with linked cost records',
        });
      }

      try {
        await deleteFile(document.storagePath);
      } catch (error) {
        request.log.error(error, 'Failed to delete file from S3');
      }

      await prisma.document.delete({ where: { id } });

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

      const { id } = request.params;

      const document = await prisma.document.findUnique({
        where: { id },
      });

      if (!document) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Document not found',
        });
      }

      if (!['failed', 'manual'].includes(document.extractionStatus)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Can only retry extraction for failed or manual documents',
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id },
          data: { extractionStatus: 'pending' },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'document',
            aggregateId: id,
            eventType: 'document.extraction_retry',
            payload: {
              documentId: id,
              storagePath: document.storagePath,
              mimeType: document.mimeType,
            },
          },
        });
      });

      return reply.send({
        success: true,
        message: 'Extraction retry queued',
      });
    }
  );
}
