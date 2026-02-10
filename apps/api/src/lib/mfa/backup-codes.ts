import { randomBytes } from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import { BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH } from './constants.js';

function normalizeBackupCode(code: string): string {
  return code.replace(/-/g, '').toLowerCase();
}

export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(BACKUP_CODE_LENGTH / 2);
    const code = bytes.toString('hex').toUpperCase().slice(0, BACKUP_CODE_LENGTH);
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashed: string[] = [];
  for (const code of codes) {
    hashed.push(await hash(normalizeBackupCode(code)));
  }
  return hashed;
}

export async function verifyBackupCode(
  code: string,
  hashedCodes: string[],
): Promise<number | null> {
  const normalized = normalizeBackupCode(code);

  for (let i = 0; i < hashedCodes.length; i += 1) {
    const hashedCode = hashedCodes[i];
    if (!hashedCode) {
      continue;
    }

    try {
      if (await verify(hashedCode, normalized)) {
        return i;
      }
    } catch {
      // Ignore invalid hash values and continue checking remaining codes.
    }
  }

  return null;
}
