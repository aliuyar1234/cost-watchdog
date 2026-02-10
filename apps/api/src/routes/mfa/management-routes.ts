import type { FastifyInstance } from 'fastify';
import { disableMfa, regenerateBackupCodes } from '../../lib/mfa.js';
import { sendBadRequest, sendForbidden } from '../../lib/errors.js';
import { logMfaUserUpdateEvent, verifyUserPassword, type PasswordBody } from './shared.js';

export async function registerMfaManagementRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PasswordBody }>('/backup/regenerate', async (request, reply) => {
    const user = request.user!;
    const { password } = request.body as PasswordBody;

    const isValidPassword = await verifyUserPassword(reply, user.sub, password);
    if (!isValidPassword) {
      return;
    }

    try {
      const backupCodes = await regenerateBackupCodes(user.sub);
      await logMfaUserUpdateEvent(request, user.sub, {
        mfaBackupCodesRegenerated: true,
      });

      return reply.send({
        success: true,
        backupCodes,
        message: 'New backup codes generated. Store them securely.',
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'MFA not enrolled') {
        return sendBadRequest(reply, cause.message);
      }
      throw cause;
    }
  });

  fastify.delete<{ Body: PasswordBody }>('/', async (request, reply) => {
    const user = request.user!;
    const { password } = request.body as PasswordBody;

    if (user.role === 'admin') {
      return sendForbidden(reply, 'Admin accounts cannot disable MFA');
    }

    const isValidPassword = await verifyUserPassword(reply, user.sub, password);
    if (!isValidPassword) {
      return;
    }

    await disableMfa(user.sub);
    await logMfaUserUpdateEvent(request, user.sub, { mfaDisabled: true });

    return reply.send({
      success: true,
      message: 'MFA has been disabled.',
    });
  });
}
