import type { FastifyReply, FastifyRequest } from 'fastify';
import { logAuditEvent } from '../../lib/audit.js';
import { verifyPassword } from '../../lib/auth.js';
import { prisma } from '../../lib/db.js';
import { sendBadRequest } from '../../lib/errors.js';
import { getAuditContext } from '../../middleware/request-context.js';

export interface EnrollVerifyBody {
  code: string;
  enrollmentId: string;
}

export interface VerifyMfaBody {
  code: string;
}

export interface BackupCodeBody {
  code: string;
}

export interface PasswordBody {
  password: string;
}

export function requireCode(reply: FastifyReply, code: string | undefined): boolean {
  if (!code) {
    sendBadRequest(reply, 'Code is required');
    return false;
  }
  return true;
}

export function requireSixDigitCode(reply: FastifyReply, code: string | undefined): boolean {
  if (!requireCode(reply, code)) {
    return false;
  }
  if (!/^\d{6}$/.test(code!)) {
    sendBadRequest(reply, 'Code must be 6 digits');
    return false;
  }
  return true;
}

export async function verifyUserPassword(
  reply: FastifyReply,
  userId: string,
  password: string | undefined,
): Promise<boolean> {
  if (!password) {
    sendBadRequest(reply, 'Password is required');
    return false;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!dbUser || !dbUser.passwordHash) {
    sendBadRequest(reply, 'Invalid credentials');
    return false;
  }

  const isValid = await verifyPassword(password, dbUser.passwordHash);
  if (!isValid) {
    sendBadRequest(reply, 'Invalid password');
    return false;
  }

  return true;
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}

export async function logMfaUserUpdateEvent(
  request: FastifyRequest,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const ctx = getAuditContext(request);
  await logAuditEvent({
    entityType: 'user',
    entityId: userId,
    action: 'update',
    metadata,
    performedBy: userId,
    ...ctx,
  }).catch((cause) => request.log.error(cause, 'Failed to log audit event'));
}
