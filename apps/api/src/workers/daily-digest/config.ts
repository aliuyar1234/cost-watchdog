import type { DailyDigestWorkerConfig } from './types.js';

export const DASHBOARD_URL = process.env['WEB_URL'] || 'http://localhost:3000';

function parseEnvNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const DEFAULT_DAILY_DIGEST_CONFIG: Required<DailyDigestWorkerConfig> = {
  pollIntervalMs: parseEnvNumber(process.env['DAILY_DIGEST_POLL_INTERVAL_MS'], 60000),
  maxAttempts: parseEnvNumber(process.env['DAILY_DIGEST_MAX_ATTEMPTS'], 3),
  runOnStartup: process.env['DAILY_DIGEST_RUN_ON_STARTUP'] === 'true',
};
