import type { FastifyInstance } from 'fastify';
import { sendBadRequest, sendNotFound } from '../../lib/errors.js';
import { startMfaEnrollment, verifyMfaEnrollment } from '../../lib/mfa.js';
import {
  logMfaUserUpdateEvent,
  requireCode,
  requireSixDigitCode,
  getUserEmail,
  type EnrollVerifyBody,
} from './shared.js';

export async function registerMfaEnrollmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/enroll', async (request, reply) => {
    const user = request.user!;
    const email = await getUserEmail(user.sub);
    if (!email) {
      return sendNotFound(reply, 'User');
    }

    try {
      const enrollment = await startMfaEnrollment({
        id: user.sub,
        email,
      });

      await logMfaUserUpdateEvent(request, user.sub, {
        mfaEnrollmentStarted: true,
        enrollmentId: enrollment.enrollmentId,
      });

      return reply.send({
        enrollmentId: enrollment.enrollmentId,
        secret: enrollment.secret,
        otpauthUrl: enrollment.otpauthUrl,
        qrCodeDataUrl: enrollment.qrCodeDataUrl,
        backupCodes: enrollment.backupCodes,
        message: 'Scan the QR code with your authenticator app, then verify with a code.',
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'MFA is already enabled for this account') {
        return sendBadRequest(reply, cause.message);
      }
      throw cause;
    }
  });

  fastify.post<{ Body: EnrollVerifyBody }>('/verify', async (request, reply) => {
    const user = request.user!;
    const { code, enrollmentId } = request.body as EnrollVerifyBody;

    if (!enrollmentId) {
      return sendBadRequest(reply, 'Code and enrollmentId are required');
    }
    if (!requireCode(reply, code) || !requireSixDigitCode(reply, code)) {
      return;
    }

    const result = await verifyMfaEnrollment(user.sub, enrollmentId, code);
    if (!result.success) {
      return reply.status(400).send({
        error: 'Verification failed',
        message: result.error,
      });
    }

    await logMfaUserUpdateEvent(request, user.sub, {
      mfaEnrollmentCompleted: true,
      enrollmentId,
    });

    return reply.send({
      success: true,
      message: 'MFA has been enabled successfully.',
    });
  });
}
