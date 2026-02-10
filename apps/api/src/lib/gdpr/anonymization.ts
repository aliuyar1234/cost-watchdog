import { createHash } from 'crypto';
import { ANONYMOUS_EMAIL_DOMAIN } from './constants.js';

const PII_FIELDS = ['email', 'firstName', 'lastName', 'avatarUrl', 'ssoSubject'];

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function generateAnonymousId(userId: string): string {
  const hash = createHash('sha256').update(userId).digest('hex').substring(0, 12);
  return `deleted_${hash}`;
}

export function generateAnonymousEmail(userId: string): string {
  return `${generateAnonymousId(userId)}@${ANONYMOUS_EMAIL_DOMAIN}`;
}

export function anonymizeJsonField(
  data: Record<string, unknown>,
  userId: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };

  for (const field of PII_FIELDS) {
    if (Object.hasOwn(result, field)) {
      result[field] = '[ANONYMIZED]';
    }
  }

  if (result['id'] === userId) {
    result['id'] = generateAnonymousId(userId);
  }

  return result;
}

export function anonymizeUnknownJsonField(data: unknown, userId: string): unknown {
  if (!isJsonObject(data)) {
    return data;
  }

  return anonymizeJsonField(data, userId);
}
