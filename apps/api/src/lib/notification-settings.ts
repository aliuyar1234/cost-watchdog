export interface UserNotificationSettings {
  emailAlertsEnabled: boolean;
  dailyDigestEnabled: boolean;
}

export const DEFAULT_USER_NOTIFICATION_SETTINGS: UserNotificationSettings = {
  emailAlertsEnabled: true,
  dailyDigestEnabled: true,
};

function normalizeSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function resolveUserNotificationSettings(value: unknown): UserNotificationSettings {
  const settings = normalizeSettings(value);

  return {
    emailAlertsEnabled: typeof settings['emailAlertsEnabled'] === 'boolean'
      ? (settings['emailAlertsEnabled'] as boolean)
      : DEFAULT_USER_NOTIFICATION_SETTINGS.emailAlertsEnabled,
    dailyDigestEnabled: typeof settings['dailyDigestEnabled'] === 'boolean'
      ? (settings['dailyDigestEnabled'] as boolean)
      : DEFAULT_USER_NOTIFICATION_SETTINGS.dailyDigestEnabled,
  };
}
