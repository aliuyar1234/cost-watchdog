import { prisma } from '../../lib/db.js';
import { resolveUserNotificationSettings } from '../../lib/notification-settings.js';
import type { DigestEmailRecipient } from './types.js';

const RECIPIENT_CACHE_TTL_MS = 60 * 1000;
let cachedRecipients: DigestEmailRecipient[] | null = null;
let cachedRecipientsAt = 0;

export function getRecipientName(
  firstName: string | null,
  lastName: string | null,
  email: string,
): string {
  if (firstName && firstName.trim()) {
    return firstName.trim();
  }
  if (lastName && lastName.trim()) {
    return lastName.trim();
  }
  return email.split('@')[0] || 'User';
}

export async function loadEmailRecipients(): Promise<DigestEmailRecipient[]> {
  const now = Date.now();
  const isTestEnv = process.env['NODE_ENV'] === 'test';
  if (
    !isTestEnv &&
    cachedRecipients &&
    now >= cachedRecipientsAt &&
    now - cachedRecipientsAt < RECIPIENT_CACHE_TTL_MS
  ) {
    return cachedRecipients;
  }

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['admin', 'manager'] },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      notificationSettings: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const filtered = recipients.filter((user) => {
    const settings = resolveUserNotificationSettings(user.notificationSettings);
    return settings.dailyDigestEnabled;
  });

  const mapped = filtered.map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  }));

  if (!isTestEnv) {
    cachedRecipients = mapped;
    cachedRecipientsAt = now;
  }

  return mapped;
}

export function resetRecipientCache(): void {
  cachedRecipients = null;
  cachedRecipientsAt = 0;
}
