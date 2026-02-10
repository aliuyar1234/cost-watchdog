import type { FastifyReply } from 'fastify';
import { sendForbidden, sendNotFound } from '../../lib/errors.js';
import { isValidUUID } from '../../lib/validators.js';
import { requireAdmin } from './shared.js';

export function ensureAdminAccess(userRole: string, reply: FastifyReply): boolean {
  if (!requireAdmin(userRole)) {
    sendForbidden(reply, 'Admin access required');
    return false;
  }

  return true;
}

export function ensureValidUserId(id: string, reply: FastifyReply): boolean {
  if (!isValidUUID(id)) {
    sendNotFound(reply, 'User');
    return false;
  }

  return true;
}
