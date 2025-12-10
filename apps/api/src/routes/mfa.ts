/**
 * MFA Routes
 *
 * Routes for managing multi-factor authentication.
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/db.js';
import { sendBadRequest, sendForbidden, sendNotFound } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { logAuditEvent } from '../lib/audit.js';
import { getAuditContext } from '../middleware/request-context.js';
import { verifyPassword } from '../lib/auth.js';
import {
  startMfaEnrollment,
  verifyMfaEnrollment,
  verifyMfaCode,
  useBackupCode,
  disableMfa,
  regenerateBackupCodes,
  getMfaStatus,
  isMfaRequiredForRole,
} from '../lib/mfa.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface EnrollVerifyBody {
  code: string;
  enrollmentId: string;
}

interface VerifyMfaBody {
  code: string;
}

interface BackupCodeBody {
  code: string;
}

interface DisableMfaBody {
  password: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MFA ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export const mfaRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /mfa/status
   * Get MFA status for current user.
   */
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

  /**
   * POST /mfa/enroll
   * Start MFA enrollment. Returns secret and backup codes.
   */
  fastify.post('/enroll', async (request, reply) => {
    const user = request.user!;

    // Get user email
    const dbUser = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { email: true },
    });

    if (!dbUser) {
      return sendNotFound(reply, 'User');
    }

    try {
      const enrollment = await startMfaEnrollment({
        id: user.sub,
        email: dbUser.email,
      });

      // Audit log: MFA enrollment started
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: user.sub,
        action: 'update',
        metadata: { mfaEnrollmentStarted: true, enrollmentId: enrollment.enrollmentId },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send({
        enrollmentId: enrollment.enrollmentId,
        secret: enrollment.secret,
        otpauthUrl: enrollment.otpauthUrl,
        qrCodeDataUrl: enrollment.qrCodeDataUrl,
        backupCodes: enrollment.backupCodes,
        message: 'Scan the QR code with your authenticator app, then verify with a code.',
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'MFA is already enabled for this account') {
        return sendBadRequest(reply, err.message);
      }
      throw err;
    }
  });

  /**
   * POST /mfa/verify
   * Verify MFA enrollment with a TOTP code.
   */
  fastify.post<{ Body: EnrollVerifyBody }>('/verify', async (request, reply) => {
    const user = request.user!;
    const { code, enrollmentId } = request.body as EnrollVerifyBody;

    if (!code || !enrollmentId) {
      return sendBadRequest(reply, 'Code and enrollmentId are required');
    }

    if (!/^\d{6}$/.test(code)) {
      return sendBadRequest(reply, 'Code must be 6 digits');
    }

    const result = await verifyMfaEnrollment(user.sub, enrollmentId, code);

    if (!result.success) {
      return reply.status(400).send({
        error: 'Verification failed',
        message: result.error,
      });
    }

    // Audit log: MFA enrollment completed
    const ctx = getAuditContext(request);
    await logAuditEvent({
      entityType: 'user',
      entityId: user.sub,
      action: 'update',
      metadata: { mfaEnrollmentCompleted: true, enrollmentId },
      performedBy: user.sub,
      ...ctx,
    }).catch((err) => request.log.error(err, 'Failed to log audit event'));

    return reply.send({
      success: true,
      message: 'MFA has been enabled successfully.',
    });
  });

  /**
   * POST /mfa/validate
   * Validate a TOTP code (for use during login challenge).
   */
  fastify.post<{ Body: VerifyMfaBody }>('/validate', async (request, reply) => {
    const user = request.user!;
    const { code } = request.body as VerifyMfaBody;

    if (!code) {
      return sendBadRequest(reply, 'Code is required');
    }

    if (!/^\d{6}$/.test(code)) {
      return sendBadRequest(reply, 'Code must be 6 digits');
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

    return reply.send({
      success: true,
    });
  });

  /**
   * POST /mfa/backup
   * Use a backup code.
   */
  fastify.post<{ Body: BackupCodeBody }>('/backup', async (request, reply) => {
    const user = request.user!;
    const { code } = request.body as BackupCodeBody;

    if (!code) {
      return sendBadRequest(reply, 'Code is required');
    }

    const result = await useBackupCode(user.sub, code);

    if (!result.success) {
      return reply.status(400).send({
        error: 'Verification failed',
        message: result.error,
      });
    }

    // Audit log: backup code used
    const ctx = getAuditContext(request);
    await logAuditEvent({
      entityType: 'user',
      entityId: user.sub,
      action: 'update',
      metadata: {
        mfaBackupCodeUsed: true,
        remainingCodes: result.remainingCodes,
      },
      performedBy: user.sub,
      ...ctx,
    }).catch((err) => request.log.error(err, 'Failed to log audit event'));

    return reply.send({
      success: true,
      remainingCodes: result.remainingCodes,
      message:
        result.remainingCodes !== undefined && result.remainingCodes <= 2
          ? 'Warning: You have few backup codes remaining. Consider regenerating them.'
          : undefined,
    });
  });

  /**
   * POST /mfa/backup/regenerate
   * Regenerate backup codes. Requires password confirmation.
   */
  fastify.post<{ Body: DisableMfaBody }>('/backup/regenerate', async (request, reply) => {
    const user = request.user!;
    const { password } = request.body as DisableMfaBody;

    if (!password) {
      return sendBadRequest(reply, 'Password is required');
    }

    // Verify password
    const dbUser = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { passwordHash: true },
    });

    if (!dbUser || !dbUser.passwordHash) {
      return sendBadRequest(reply, 'Invalid credentials');
    }

    const isValid = await verifyPassword(password, dbUser.passwordHash);
    if (!isValid) {
      return sendBadRequest(reply, 'Invalid password');
    }

    try {
      const backupCodes = await regenerateBackupCodes(user.sub);

      // Audit log: backup codes regenerated
      const ctx = getAuditContext(request);
      await logAuditEvent({
        entityType: 'user',
        entityId: user.sub,
        action: 'update',
        metadata: { mfaBackupCodesRegenerated: true },
        performedBy: user.sub,
        ...ctx,
      }).catch((err) => request.log.error(err, 'Failed to log audit event'));

      return reply.send({
        success: true,
        backupCodes,
        message: 'New backup codes generated. Store them securely.',
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'MFA not enrolled') {
        return sendBadRequest(reply, err.message);
      }
      throw err;
    }
  });

  /**
   * DELETE /mfa
   * Disable MFA. Requires password confirmation.
   * Admin accounts cannot disable MFA.
   */
  fastify.delete<{ Body: DisableMfaBody }>('/', async (request, reply) => {
    const user = request.user!;
    const { password } = request.body as DisableMfaBody;

    // Admin accounts cannot disable MFA
    if (user.role === 'admin') {
      return sendForbidden(reply, 'Admin accounts cannot disable MFA');
    }

    if (!password) {
      return sendBadRequest(reply, 'Password is required');
    }

    // Verify password
    const dbUser = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { passwordHash: true },
    });

    if (!dbUser || !dbUser.passwordHash) {
      return sendBadRequest(reply, 'Invalid credentials');
    }

    const isValid = await verifyPassword(password, dbUser.passwordHash);
    if (!isValid) {
      return sendBadRequest(reply, 'Invalid password');
    }

    await disableMfa(user.sub);

    // Audit log: MFA disabled
    const ctx = getAuditContext(request);
    await logAuditEvent({
      entityType: 'user',
      entityId: user.sub,
      action: 'update',
      metadata: { mfaDisabled: true },
      performedBy: user.sub,
      ...ctx,
    }).catch((err) => request.log.error(err, 'Failed to log audit event'));

    return reply.send({
      success: true,
      message: 'MFA has been disabled.',
    });
  });
};

export default mfaRoutes;
