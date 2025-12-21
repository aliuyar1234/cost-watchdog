import { DEFAULT_ANOMALY_SETTINGS } from '@cost-watchdog/core';
import { prisma } from './db.js';

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
  maxAlertsPerDay: DEFAULT_ANOMALY_SETTINGS.maxAlertsPerDay,
};

const SETTINGS_CACHE_TTL_MS = 60 * 1000;
let cachedAlertSettings: AlertSettings | null = null;
let cachedAlertSettingsAt = 0;

function normalizeSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function isAlertSettings(value: unknown): value is Partial<AlertSettings> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function loadAlertSettings(): Promise<AlertSettings> {
  const now = Date.now();
  if (cachedAlertSettings && now - cachedAlertSettingsAt < SETTINGS_CACHE_TTL_MS) {
    return cachedAlertSettings;
  }

  const record = await prisma.appSettings.findFirst();
  const settings = normalizeSettings(record?.settings);
  const alerts = settings['alerts'];

  const merged = {
    ...DEFAULT_ALERT_SETTINGS,
    ...(isAlertSettings(alerts) ? alerts : {}),
  } as AlertSettings;

  const normalized = {
    ...merged,
    maxAlertsPerDay: typeof merged.maxAlertsPerDay === 'number' && merged.maxAlertsPerDay > 0
      ? merged.maxAlertsPerDay
      : DEFAULT_ALERT_SETTINGS.maxAlertsPerDay,
  };

  cachedAlertSettings = normalized;
  cachedAlertSettingsAt = now;
  return normalized;
}

export function shouldNotifySeverity(settings: AlertSettings, severity: string): boolean {
  switch (severity) {
    case 'critical':
      return settings.notifyOnCritical;
    case 'warning':
      return settings.notifyOnWarning;
    case 'info':
      return settings.notifyOnInfo;
    default:
      return false;
  }
}

export function clearAlertSettingsCache(): void {
  cachedAlertSettings = null;
  cachedAlertSettingsAt = 0;
}
