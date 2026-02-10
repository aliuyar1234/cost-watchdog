import type { AlertSettings, GeneralSettings, ThresholdSettings } from '../../../lib/api';

export type SettingsTab = 'general' | 'alerts' | 'thresholds' | 'api';

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  emailEnabled: true,
  slackEnabled: false,
  teamsEnabled: false,
  slackWebhookUrl: '',
  teamsWebhookUrl: '',
  notifyOnCritical: true,
  notifyOnWarning: true,
  notifyOnInfo: false,
  dailyDigestEnabled: false,
  dailyDigestTime: '08:00',
  maxAlertsPerDay: 50,
};

export const DEFAULT_THRESHOLDS: ThresholdSettings = {
  yoyThreshold: 20,
  momThreshold: 30,
  pricePerUnitThreshold: 10,
  budgetThreshold: 10,
  minHistoricalMonths: 12,
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  timezone: 'UTC',
};
