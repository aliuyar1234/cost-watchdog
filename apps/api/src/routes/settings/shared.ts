import { sendForbidden } from '../../lib/errors.js';
import { prisma } from '../../lib/db.js';
import type { FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';

export interface TestWebhookBody {
  webhookUrl: string;
}

export interface AlertSettingsPayload {
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

export interface ThresholdSettingsPayload {
  yoyThreshold: number;
  momThreshold: number;
  pricePerUnitThreshold: number;
  budgetThreshold: number;
  minHistoricalMonths: number;
}

export interface GeneralSettingsPayload {
  timezone: string;
}

export type SettingsStore = Record<string, unknown>;

function requireAdmin(role: string): boolean {
  return role === 'admin';
}

export function enforceAdmin(reply: FastifyReply, role: string): boolean {
  if (!requireAdmin(role)) {
    sendForbidden(reply, 'Admin access required');
    return false;
  }
  return true;
}

export function normalizeSettings(value: unknown): SettingsStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as SettingsStore;
}

function toInputJsonObject(value: SettingsStore): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

export async function mergeAndUpsertSettings(partial: SettingsStore): Promise<SettingsStore> {
  const existing = await prisma.appSettings.findFirst();
  const existingSettings = normalizeSettings(existing?.settings);

  const record = await prisma.appSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      settings: toInputJsonObject(partial),
    },
    update: {
      settings: {
        ...toInputJsonObject(existingSettings),
        ...toInputJsonObject(partial),
      } as Prisma.InputJsonObject,
    },
  });

  return normalizeSettings(record.settings);
}
