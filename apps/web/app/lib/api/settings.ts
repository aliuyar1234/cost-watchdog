/**
 * Settings API
 */

import { fetchApi } from './client';

export interface AlertSettings {
  emailEnabled: boolean;
  slackEnabled: boolean;
  teamsEnabled: boolean;
  slackWebhookUrl: string;
  teamsWebhookUrl: string;
  notifyOnCritical: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  maxAlertsPerDay: number;
}

export interface ThresholdSettings {
  yoyThreshold: number;
  momThreshold: number;
  pricePerUnitThreshold: number;
  budgetThreshold: number;
  minHistoricalMonths: number;
}

export interface GeneralSettings {
  timezone: string;
}

export interface SettingsResponse {
  alerts: AlertSettings | null;
  thresholds: ThresholdSettings | null;
  general: GeneralSettings | null;
}

export const settingsApi = {
  get: () => fetchApi<SettingsResponse>('/settings'),

  updateAlerts: (payload: AlertSettings) =>
    fetchApi<{ success: boolean; alerts: AlertSettings }>('/settings/alerts', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updateThresholds: (payload: ThresholdSettings) =>
    fetchApi<{ success: boolean; thresholds: ThresholdSettings }>('/settings/thresholds', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updateGeneral: (payload: GeneralSettings) =>
    fetchApi<{ success: boolean; general: GeneralSettings }>('/settings/general', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  testSlackWebhook: (webhookUrl: string) =>
    fetchApi<{ success: boolean; message: string }>('/settings/test-slack', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl }),
    }),

  testTeamsWebhook: (webhookUrl: string) =>
    fetchApi<{ success: boolean; message: string }>('/settings/test-teams', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl }),
    }),
};
