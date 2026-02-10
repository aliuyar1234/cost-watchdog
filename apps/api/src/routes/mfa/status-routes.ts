import type { FastifyInstance } from 'fastify';
import { getMfaStatus, isMfaRequiredForRole } from '../../lib/mfa.js';

export async function registerMfaStatusRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/status', async (request, reply) => {
    const user = request.user!;
    const status = await getMfaStatus(user.sub);
    const required = isMfaRequiredForRole(user.role);

    return reply.send({
      enabled: status.enabled,
      required,
      backupCodesRemaining: status.backupCodesRemaining,
      enrolledAt: status.enrolledAt?.toISOString() || null,
    });
  });
}
