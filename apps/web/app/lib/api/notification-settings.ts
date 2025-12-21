/**
 * Notification Settings API
 */

import { fetchApi } from './client';

export interface NotificationSettings {
  emailAlertsEnabled: boolean;
  dailyDigestEnabled: boolean;
}

export interface NotificationSettingsResponse {
  settings: NotificationSettings;
}

export const notificationSettingsApi = {
  get: () => fetchApi<NotificationSettingsResponse>('/notification-settings'),

  update: (payload: Partial<NotificationSettings>) =>
    fetchApi<{ success: boolean; settings: NotificationSettings }>('/notification-settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
