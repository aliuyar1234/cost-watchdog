import { prisma } from '../db.js';
import { anonymizeUnknownJsonField, generateAnonymousId } from './anonymization.js';

export async function anonymizeAuditLogs(userId: string): Promise<number> {
  const anonymousId = generateAnonymousId(userId);
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [{ performedBy: userId }, { entityType: 'user', entityId: userId }],
      anonymized: false,
    },
    select: {
      id: true,
      performedBy: true,
      before: true,
      after: true,
    },
  });

  let anonymizedCount = 0;

  for (const log of auditLogs) {
    const updates: Record<string, unknown> = {
      anonymized: true,
      ipAddress: null,
      userAgent: null,
    };

    if (log.performedBy === userId) {
      updates['performedBy'] = anonymousId;
    }

    if (log.before) {
      updates['before'] = anonymizeUnknownJsonField(log.before, userId);
    }

    if (log.after) {
      updates['after'] = anonymizeUnknownJsonField(log.after, userId);
    }

    await prisma.auditLog.update({
      where: { id: log.id },
      data: updates,
    });

    anonymizedCount += 1;
  }

  return anonymizedCount;
}
