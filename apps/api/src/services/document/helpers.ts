import { logAuditEvent } from '../../lib/audit.js';
import type { LoggerLike, ServiceContext, ServiceError } from './types.js';

export function createServiceError(
  error: string,
  message: string,
  statusCode: number,
  details?: unknown,
): ServiceError {
  return {
    success: false,
    error,
    message,
    statusCode,
    details,
  };
}

export function createDocumentNotFoundError(): ServiceError {
  return createServiceError('Not Found', 'Document not found', 404);
}

export async function logDocumentAudit(
  payload: Parameters<typeof logAuditEvent>[0],
  logger?: LoggerLike,
): Promise<void> {
  await logAuditEvent(payload).catch((err) => logger?.error(err, 'Failed to log audit event'));
}

export function withContext(
  payload: Omit<Parameters<typeof logAuditEvent>[0], 'requestId' | 'ipAddress' | 'userAgent'>,
  context: ServiceContext,
): Parameters<typeof logAuditEvent>[0] {
  return {
    ...payload,
    ...context,
  };
}
