import { prisma } from './db.js';

const SETTINGS_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

let cachedTimeZone: string | null = null;
let cachedTimeZoneAt = 0;

function normalizeSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_TIME_ZONE;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_TIME_ZONE;
  }

  return isValidTimeZone(trimmed) ? trimmed : DEFAULT_TIME_ZONE;
}

export async function loadAppTimezone(): Promise<string> {
  const now = Date.now();
  if (cachedTimeZone && now - cachedTimeZoneAt < SETTINGS_CACHE_TTL_MS) {
    return cachedTimeZone;
  }

  const record = await prisma.appSettings.findFirst();
  const settings = normalizeSettings(record?.settings);
  const resolved = resolveTimeZone(settings['timezone']);

  cachedTimeZone = resolved;
  cachedTimeZoneAt = now;
  return resolved;
}

export function clearAppTimezoneCache(): void {
  cachedTimeZone = null;
  cachedTimeZoneAt = 0;
}
