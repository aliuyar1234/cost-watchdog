import { FastifyPluginAsync } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../lib/db.js';
import { sendNotFound, sendBadRequest, sendForbidden } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';

interface ApiKeyQuery {
  limit?: number;
  offset?: number;
  isActive?: boolean;
}

interface ApiKeyIdParams {
  id: string;
}

interface CreateApiKeyBody {
  name: string;
  scopes: string[];
  expiresAt?: string;
}

interface ApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ApiKeyWithSecret extends ApiKeyResponse {
  apiKey: string;
}

const VALID_SCOPES = [
  'read:cost_records',
  'write:cost_records',
  'read:anomalies',
  'write:anomalies',
  'read:documents',
  'write:documents',
  'read:analytics',
  'read:exports',
] as const;

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `cwk_${randomBytes(32).toString('base64url')}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 12);
  return { key, hash, prefix };
}

function requireAdmin(userRole: string): boolean {
  return userRole === 'admin';
}

/**
 * API key management routes
 */
export const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api-keys
   */
  fastify.get<{ Querystring: ApiKeyQuery }>(
    '/',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const query = request.query as ApiKeyQuery;
      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;

      const where: Record<string, unknown> = {};
      if (query.isActive !== undefined) where['isActive'] = query.isActive;

      const [data, total] = await Promise.all([
        prisma.apiKey.findMany({
          where,
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            scopes: true,
            lastUsedAt: true,
            expiresAt: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.apiKey.count({ where }),
      ]);

      return reply.send({
        data: data.map(formatApiKey),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + data.length < total,
        },
      });
    }
  );

  /**
   * GET /api-keys/:id
   */
  fastify.get<{ Params: ApiKeyIdParams }>(
    '/:id',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const { id } = request.params;

      const apiKey = await prisma.apiKey.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          lastUsedAt: true,
          expiresAt: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!apiKey) {
        return sendNotFound(reply, 'API Key');
      }

      return reply.send(formatApiKey(apiKey));
    }
  );

  /**
   * POST /api-keys
   */
  fastify.post<{ Body: CreateApiKeyBody }>(
    '/',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const body = request.body as CreateApiKeyBody;

      if (!body.name || !body.scopes || body.scopes.length === 0) {
        return sendBadRequest(reply, 'Name and scopes are required');
      }

      const invalidScopes = body.scopes.filter(
        (s) => !VALID_SCOPES.includes(s as typeof VALID_SCOPES[number])
      );
      if (invalidScopes.length > 0) {
        return sendBadRequest(reply, `Invalid scopes: ${invalidScopes.join(', ')}`);
      }

      const { key, hash, prefix } = generateApiKey();

      const newApiKey = await prisma.apiKey.create({
        data: {
          name: body.name,
          keyHash: hash,
          keyPrefix: prefix,
          scopes: body.scopes,
          createdById: user.sub,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          lastUsedAt: true,
          expiresAt: true,
          isActive: true,
          createdAt: true,
        },
      });

      const response: ApiKeyWithSecret = {
        ...formatApiKey(newApiKey),
        apiKey: key,
      };

      return reply.status(201).send(response);
    }
  );

  /**
   * DELETE /api-keys/:id
   */
  fastify.delete<{ Params: ApiKeyIdParams }>(
    '/:id',
    async (request, reply) => {
      const user = request.user!;

      if (!requireAdmin(user.role)) {
        return sendForbidden(reply, 'Admin access required');
      }

      const { id } = request.params;

      const existing = await prisma.apiKey.findUnique({ where: { id } });
      if (!existing) {
        return sendNotFound(reply, 'API Key');
      }

      await prisma.apiKey.update({
        where: { id },
        data: { isActive: false, revokedAt: new Date() },
      });

      return reply.status(204).send();
    }
  );

  /**
   * GET /api-keys/scopes
   */
  fastify.get(
    '/scopes',
    async (request, reply) => {
      const user = request.user!;

      return reply.send({
        scopes: VALID_SCOPES.map((scope) => ({
          name: scope,
          description: getScopeDescription(scope),
        })),
      });
    }
  );
};

function formatApiKey(apiKey: {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}): ApiKeyResponse {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    isActive: apiKey.isActive,
    createdAt: apiKey.createdAt.toISOString(),
  };
}

function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'read:cost_records': 'Read cost records',
    'write:cost_records': 'Create and update cost records',
    'read:anomalies': 'Read anomalies',
    'write:anomalies': 'Update anomaly status',
    'read:documents': 'Read documents',
    'write:documents': 'Upload and manage documents',
    'read:analytics': 'Read analytics data',
    'read:exports': 'Export data',
  };
  return descriptions[scope] || scope;
}

export default apiKeyRoutes;
