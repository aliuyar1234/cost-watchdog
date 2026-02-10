import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuditContext } from '../../middleware/request-context.js';
import type { ServiceContext } from '../../services/document.service.js';

export function getDocumentServiceContext(request: FastifyRequest): ServiceContext {
  const ctx = getAuditContext(request);
  return {
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress || request.ip,
    userAgent: ctx.userAgent,
  };
}

export function requireDocumentUser(
  request: FastifyRequest,
  reply: FastifyReply,
): NonNullable<FastifyRequest['user']> | null {
  if (!request.user) {
    reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }

  return request.user;
}
