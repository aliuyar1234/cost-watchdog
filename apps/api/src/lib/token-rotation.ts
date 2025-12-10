/**
 * Token Rotation Library
 *
 * Implements refresh token rotation with family tracking for theft detection:
 * - Each login creates a new "token family"
 * - Each refresh rotates the token within the family
 * - Reuse of an old token invalidates the entire family (theft detected)
 */

import { redis } from './redis.js';
import { randomUUID, createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TOKEN_FAMILY_PREFIX = 'token_family:';
const TOKEN_FAMILY_TTL = 7 * 24 * 60 * 60; // 7 days (matches refresh token TTL)
const USED_TOKEN_PREFIX = 'used_token:';
const USED_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TokenFamily {
  familyId: string;
  userId: string;
  currentTokenHash: string;
  generation: number;
  createdAt: number;
  lastRotatedAt: number;
  invalidated: boolean;
  invalidationReason?: string;
}

export interface RotationResult {
  success: boolean;
  familyId?: string;
  newTokenHash?: string;
  generation?: number;
  error?: string;
  theftDetected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN HASHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hash a token for storage/comparison.
 * We don't store raw tokens, only their hashes.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN FAMILY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new token family when user logs in.
 */
export async function createTokenFamily(
  userId: string,
  refreshToken: string
): Promise<TokenFamily> {
  const familyId = randomUUID();
  const tokenHash = hashToken(refreshToken);
  const now = Date.now();

  const family: TokenFamily = {
    familyId,
    userId,
    currentTokenHash: tokenHash,
    generation: 1,
    createdAt: now,
    lastRotatedAt: now,
    invalidated: false,
  };

  const key = `${TOKEN_FAMILY_PREFIX}${familyId}`;
  await redis.setex(key, TOKEN_FAMILY_TTL, JSON.stringify(family));

  return family;
}

/**
 * Get a token family by ID.
 */
export async function getTokenFamily(familyId: string): Promise<TokenFamily | null> {
  const key = `${TOKEN_FAMILY_PREFIX}${familyId}`;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data) as TokenFamily;
}

/**
 * Update a token family with a new token.
 */
async function updateTokenFamily(family: TokenFamily): Promise<void> {
  const key = `${TOKEN_FAMILY_PREFIX}${family.familyId}`;
  await redis.setex(key, TOKEN_FAMILY_TTL, JSON.stringify(family));
}

/**
 * Invalidate a token family (theft detection or logout).
 */
export async function invalidateTokenFamily(
  familyId: string,
  reason: string
): Promise<boolean> {
  const family = await getTokenFamily(familyId);
  if (!family) return false;

  family.invalidated = true;
  family.invalidationReason = reason;
  await updateTokenFamily(family);

  return true;
}

/**
 * Invalidate all token families for a user.
 * Used when password is changed, account locked, etc.
 */
export async function invalidateAllFamiliesForUser(
  userId: string,
  reason: string
): Promise<number> {
  // Scan for all families belonging to this user
  // Note: In production with many users, consider using a secondary index
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [newCursor, foundKeys] = await redis.scan(
      cursor,
      'MATCH',
      `${TOKEN_FAMILY_PREFIX}*`,
      'COUNT',
      100
    );
    cursor = newCursor;
    keys.push(...foundKeys);
  } while (cursor !== '0');

  let invalidatedCount = 0;

  for (const key of keys) {
    const data = await redis.get(key);
    if (!data) continue;

    const family = JSON.parse(data) as TokenFamily;
    if (family.userId === userId && !family.invalidated) {
      family.invalidated = true;
      family.invalidationReason = reason;
      await redis.setex(key, TOKEN_FAMILY_TTL, JSON.stringify(family));
      invalidatedCount++;
    }
  }

  return invalidatedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN ROTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mark a token as used (for reuse detection).
 */
async function markTokenAsUsed(tokenHash: string, familyId: string): Promise<void> {
  const key = `${USED_TOKEN_PREFIX}${tokenHash}`;
  await redis.setex(key, USED_TOKEN_TTL, familyId);
}

/**
 * Check if a token has been used before (reuse detection).
 */
async function isTokenUsed(tokenHash: string): Promise<string | null> {
  const key = `${USED_TOKEN_PREFIX}${tokenHash}`;
  return redis.get(key);
}

/**
 * Rotate a refresh token.
 *
 * This is the core of the token rotation security:
 * 1. Validates the current token matches the family's current token
 * 2. Checks for reuse (indicates token theft)
 * 3. If valid, marks old token as used and updates family with new token
 *
 * Returns the new token hash to be used in the new refresh token.
 */
export async function rotateToken(
  familyId: string,
  currentToken: string,
  newToken: string
): Promise<RotationResult> {
  const currentHash = hashToken(currentToken);
  const newHash = hashToken(newToken);

  // Get the token family
  const family = await getTokenFamily(familyId);
  if (!family) {
    return { success: false, error: 'Token family not found' };
  }

  // Check if family is already invalidated
  if (family.invalidated) {
    return {
      success: false,
      error: `Token family invalidated: ${family.invalidationReason || 'unknown'}`,
    };
  }

  // Check for token reuse (theft detection)
  const previousFamilyId = await isTokenUsed(currentHash);
  if (previousFamilyId) {
    // This token was already used! Possible theft.
    // Invalidate the entire family.
    await invalidateTokenFamily(familyId, 'token_reuse_detected');

    return {
      success: false,
      error: 'Token reuse detected - possible theft',
      theftDetected: true,
    };
  }

  // Verify the token matches the current expected token
  if (family.currentTokenHash !== currentHash) {
    // Token doesn't match - could be an old token being replayed
    await invalidateTokenFamily(familyId, 'invalid_token_presented');

    return {
      success: false,
      error: 'Invalid token presented',
      theftDetected: true,
    };
  }

  // Mark the current token as used
  await markTokenAsUsed(currentHash, familyId);

  // Update family with new token
  family.currentTokenHash = newHash;
  family.generation += 1;
  family.lastRotatedAt = Date.now();
  await updateTokenFamily(family);

  return {
    success: true,
    familyId: family.familyId,
    newTokenHash: newHash,
    generation: family.generation,
  };
}

/**
 * Validate a refresh token belongs to a valid, active family.
 * Does NOT rotate the token - use rotateToken for that.
 */
export async function validateTokenFamily(
  familyId: string,
  token: string
): Promise<{
  valid: boolean;
  family?: TokenFamily;
  error?: string;
  theftDetected?: boolean;
}> {
  const tokenHash = hashToken(token);

  // Get the token family
  const family = await getTokenFamily(familyId);
  if (!family) {
    return { valid: false, error: 'Token family not found' };
  }

  // Check if family is invalidated
  if (family.invalidated) {
    return {
      valid: false,
      error: `Token family invalidated: ${family.invalidationReason || 'unknown'}`,
    };
  }

  // Check for token reuse
  const previousFamilyId = await isTokenUsed(tokenHash);
  if (previousFamilyId) {
    // Token was already used - theft detected
    await invalidateTokenFamily(familyId, 'token_reuse_detected');
    return {
      valid: false,
      error: 'Token reuse detected',
      theftDetected: true,
    };
  }

  // Verify token matches
  if (family.currentTokenHash !== tokenHash) {
    return {
      valid: false,
      error: 'Token does not match current family token',
      theftDetected: true,
    };
  }

  return { valid: true, family };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up expired token families.
 * Redis TTL handles this automatically, but this can be used for manual cleanup.
 */
export async function cleanupExpiredFamilies(): Promise<number> {
  // Redis TTL handles expiration, this is a no-op
  // Left for interface compatibility and potential future use
  return 0;
}
