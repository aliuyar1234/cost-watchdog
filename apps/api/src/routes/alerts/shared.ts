import { createHmac, timingSafeEqual } from 'crypto';
import type { Alert } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { buildAccessFilter, getUserRestrictions } from '../../lib/access-control.js';
import { secrets } from '../../lib/secrets.js';
import { TtlCache } from '../../lib/ttl-cache.js';

const ALERT_STATS_CACHE_TTL_MS = 30 * 1000;
export const ALERT_STATS_CACHE_CONTROL = 'private, max-age=30';
export const alertStatsCache = new TtlCache<unknown>(ALERT_STATS_CACHE_TTL_MS, 200);

export const MAX_LIMIT = 100;

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const ALERT_TOKEN_SECRET = secrets.getAuthSecret();
if (!ALERT_TOKEN_SECRET) {
  if (IS_PRODUCTION) {
    throw new Error('FATAL: AUTH_SECRET is required for alert token generation in production');
  }
  console.warn(
    '[Alerts] WARNING: AUTH_SECRET not set. Using insecure default for development only.',
  );
}
const EFFECTIVE_ALERT_SECRET = ALERT_TOKEN_SECRET || 'dev-secret-for-alerts-NEVER-USE-IN-PROD';

export interface AlertQuery {
  status?: string;
  channel?: string;
  anomalyId?: string;
  limit?: number;
  offset?: number;
}

export interface AlertIdParams {
  id: string;
}

export interface TrackClickQuery {
  token?: string;
}

export interface AlertResponse {
  id: string;
  anomalyId: string;
  channel: string;
  recipient: string;
  subject: string;
  status: string;
  sentAt: string | null;
  clickedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export function generateAlertToken(alertId: string): string {
  const hmac = createHmac('sha256', EFFECTIVE_ALERT_SECRET);
  hmac.update(alertId);
  return hmac.digest('hex');
}

export function verifyAlertToken(alertId: string, token: string): boolean {
  try {
    const expectedToken = generateAlertToken(alertId);
    const tokenBuffer = Buffer.from(token, 'hex');
    const expectedBuffer = Buffer.from(expectedToken, 'hex');
    if (tokenBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(tokenBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export async function getAlertAccessFilter(userId: string): Promise<Record<string, unknown>> {
  const restrictions = await getUserRestrictions(userId);
  return restrictions.hasRestrictions
    ? { anomaly: { costRecord: buildAccessFilter(restrictions) } }
    : {};
}

export function isTrackClickRoute(request: FastifyRequest): boolean {
  const routeUrl = request.routeOptions.url;
  return (
    request.method.toUpperCase() === 'POST' &&
    typeof routeUrl === 'string' &&
    routeUrl.toLowerCase().endsWith('/:id/track-click')
  );
}

export function formatAlert(
  alert: Alert & { anomaly?: unknown },
): AlertResponse & { anomaly?: unknown } {
  return {
    id: alert.id,
    anomalyId: alert.anomalyId,
    channel: alert.channel,
    recipient: alert.recipient,
    subject: alert.subject,
    status: alert.status,
    sentAt: alert.sentAt?.toISOString() ?? null,
    clickedAt: alert.clickedAt?.toISOString() ?? null,
    errorMessage: alert.errorMessage,
    createdAt: alert.createdAt.toISOString(),
    ...(alert.anomaly ? { anomaly: alert.anomaly } : {}),
  };
}
