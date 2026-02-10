import { prisma } from '../../lib/db.js';
import { resolveUserNotificationSettings } from '../../lib/notification-settings.js';

const RECIPIENT_CACHE_TTL_MS = 60 * 1000;
let cachedEmailRecipients: Array<{ id: string; email: string }> | null = null;
let cachedEmailRecipientsAt = 0;

export async function loadEmailRecipients(): Promise<Array<{ id: string; email: string }>> {
  const now = Date.now();
  if (cachedEmailRecipients && now - cachedEmailRecipientsAt < RECIPIENT_CACHE_TTL_MS) {
    return cachedEmailRecipients;
  }

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['admin', 'manager'] },
    },
    select: {
      id: true,
      email: true,
      notificationSettings: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const filtered = recipients.filter((user) => {
    const settings = resolveUserNotificationSettings(user.notificationSettings);
    return settings.emailAlertsEnabled;
  });

  cachedEmailRecipients = filtered.map((user) => ({ id: user.id, email: user.email }));
  cachedEmailRecipientsAt = now;
  return cachedEmailRecipients;
}

export function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'Kritisch';
    case 'warning':
      return 'Warnung';
    default:
      return 'Info';
  }
}
