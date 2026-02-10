import type { FastifyInstance } from 'fastify';
import { useBackupCode, verifyMfaCode } from '../../lib/mfa.js';
import {
  logMfaUserUpdateEvent,
  requireCode,
  requireSixDigitCode,
  type BackupCodeBody,
  type VerifyMfaBody,
} from './shared.js';

export async function registerMfaChallengeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: VerifyMfaBody }>('/validate', async (request, reply) => {
    const user = request.user!;
    const { code } = request.body as VerifyMfaBody;

    if (!requireSixDigitCode(reply, code)) {
      return;
    }

    const result = await verifyMfaCode(user.sub, code);
    if (!result.success) {
      return reply.status(400).send({
        error: 'Verification failed',
        message: result.error,
        remainingAttempts: result.remainingAttempts,
        lockoutUntil: result.lockoutUntil?.toISOString(),
      });
    }

    return reply.send({ success: true });
  });

  fastify.post<{ Body: BackupCodeBody }>('/backup', async (request, reply) => {
    const user = request.user!;
    const { code } = request.body as BackupCodeBody;

    if (!requireCode(reply, code)) {
      return;
    }

    const result = await useBackupCode(user.sub, code);
    if (!result.success) {
      return reply.status(400).send({
        error: 'Verification failed',
        message: result.error,
      });
    }

    await logMfaUserUpdateEvent(request, user.sub, {
      mfaBackupCodeUsed: true,
      remainingCodes: result.remainingCodes,
    });

    return reply.send({
      success: true,
      remainingCodes: result.remainingCodes,
      message:
        result.remainingCodes !== undefined && result.remainingCodes <= 2
          ? 'Warning: You have few backup codes remaining. Consider regenerating them.'
          : undefined,
    });
  });
}
