import type { FastifyReply } from 'fastify';

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Send a 400 Bad Request response
 */
export function sendBadRequest(
  reply: FastifyReply,
  message: string,
  details?: Record<string, unknown>
): FastifyReply {
  const response: ErrorResponse = { error: 'Bad Request', message };
  if (details) {
    response.details = details;
  }
  return reply.status(400).send(response);
}

/**
 * Send a 401 Unauthorized response
 */
export function sendUnauthorized(
  reply: FastifyReply,
  message = 'Unauthorized'
): FastifyReply {
  return reply.status(401).send({ error: message });
}

/**
 * Send a 403 Forbidden response
 */
export function sendForbidden(
  reply: FastifyReply,
  message = 'Forbidden'
): FastifyReply {
  return reply.status(403).send({ error: message });
}

/**
 * Send a 404 Not Found response
 */
export function sendNotFound(
  reply: FastifyReply,
  resource = 'Resource'
): FastifyReply {
  return reply.status(404).send({ error: `${resource} not found` });
}

/**
 * Send a 409 Conflict response
 */
export function sendConflict(
  reply: FastifyReply,
  message: string
): FastifyReply {
  return reply.status(409).send({ error: 'Conflict', message });
}

/**
 * Send a 422 Unprocessable Entity response (validation errors)
 */
export function sendValidationError(
  reply: FastifyReply,
  errors: Record<string, string> | string[]
): FastifyReply {
  return reply.status(422).send({
    error: 'Validation Error',
    details: errors,
  });
}

/**
 * Send a 500 Internal Server Error response
 */
export function sendInternalError(
  reply: FastifyReply,
  message = 'Internal Server Error'
): FastifyReply {
  return reply.status(500).send({ error: message });
}
