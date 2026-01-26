import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { secrets } from './secrets.js';

/**
 * JWT payload structure for authenticated requests.
 * Single-tenant architecture - no tenantId needed.
 */
export interface AuthPayload extends JWTPayload {
  sub: string; // User ID
  email: string;
  role: string;
  type?: 'access';
  jti?: string; // Session ID for tracking
}

/**
 * Auth configuration loaded from Docker secrets or environment.
 * AUTH_SECRET is REQUIRED - application will crash without it.
 * Reads from /run/secrets/auth_secret first, falls back to AUTH_SECRET env var.
 */
const AUTH_SECRET = secrets.getRequiredAuthSecret();
if (AUTH_SECRET.length < 32) {
  throw new Error('FATAL: AUTH_SECRET must be at least 32 characters long.');
}

const JWT_ISSUER = 'cost-watchdog';
const JWT_AUDIENCE = 'cost-watchdog-api';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Encode secret for jose library
const secretKey = new TextEncoder().encode(AUTH_SECRET);

/**
 * Validation schemas for auth requests.
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/**
 * Hash a password using Argon2id.
 *
 * @param password - Plain text password
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456, // 19 MB
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

/**
 * Verify a password against a hash.
 *
 * @param hash - Stored password hash
 * @param password - Plain text password to verify
 * @returns True if password matches
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Generate a JWT access token.
 *
 * @param payload - User data to include in token
 * @returns Signed JWT string
 */
export async function generateAccessToken(
  payload: Omit<AuthPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
): Promise<string> {
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secretKey);
}

/**
 * Generate a JWT refresh token.
 *
 * @param userId - User ID to include in token
 * @returns Signed JWT string
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(secretKey);
}

/**
 * Verify and decode a JWT token.
 *
 * @param token - JWT string to verify
 * @returns Decoded payload or null if invalid
 */
export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // Ensure refresh tokens can't be used as access tokens.
    if (payload['type'] === 'refresh') {
      return null;
    }

    // Require expected access-token claims.
    if (
      typeof payload.sub !== 'string' ||
      typeof payload['email'] !== 'string' ||
      typeof payload['role'] !== 'string'
    ) {
      return null;
    }

    // Support legacy access tokens that don't have `type`, but reject unknown types.
    if (payload['type'] && payload['type'] !== 'access') {
      return null;
    }

    return payload as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Verify a refresh token specifically.
 *
 * @param token - Refresh token string
 * @returns User ID if valid, null otherwise
 */
export async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (payload['type'] !== 'refresh' || !payload.sub) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Generate both access and refresh tokens for a user.
 * Uses a shared JTI (session ID) for both tokens to enable session tracking.
 *
 * @param user - User data
 * @returns Object containing both tokens and session ID
 */
export async function generateTokenPair(user: {
  id: string;
  email: string;
  role: string;
}): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  // Generate a unique session ID (JTI) shared across access and refresh tokens
  const sessionId = randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    new SignJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .setJti(sessionId)
      .sign(secretKey),
    new SignJWT({ sub: user.id, type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(REFRESH_TOKEN_EXPIRY)
      .setJti(sessionId)
      .sign(secretKey),
  ]);

  return { accessToken, refreshToken, sessionId };
}

/**
 * Generate token pair with token family ID for rotation support.
 * The family ID is embedded in the refresh token for rotation tracking.
 *
 * @param user - User data
 * @param familyId - Token family ID for rotation tracking
 * @returns Object containing both tokens, session ID, and family ID
 */
export async function generateTokenPairWithFamily(
  user: {
    id: string;
    email: string;
    role: string;
  },
  familyId: string,
  sessionId?: string,
): Promise<{ accessToken: string; refreshToken: string; sessionId: string; familyId: string }> {
  // Reuse existing session ID when provided (e.g., refresh), otherwise create a new one
  const effectiveSessionId = sessionId || randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    new SignJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .setJti(effectiveSessionId)
      .sign(secretKey),
    new SignJWT({
      sub: user.id,
      type: 'refresh',
      fid: familyId, // Token family ID for rotation
      rti: randomUUID(), // Ensure refresh tokens are unique even within the same second
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(REFRESH_TOKEN_EXPIRY)
      .setJti(effectiveSessionId)
      .sign(secretKey),
  ]);

  return { accessToken, refreshToken, sessionId: effectiveSessionId, familyId };
}

/**
 * Verify a refresh token and extract family ID.
 *
 * @param token - Refresh token string
 * @returns User ID and family ID if valid, null otherwise
 */
export async function verifyRefreshTokenWithFamily(token: string): Promise<{
  userId: string;
  familyId: string;
  sessionId: string | null;
  issuedAt: number | null;
} | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (payload['type'] !== 'refresh' || !payload.sub) {
      return null;
    }

    const familyId = payload['fid'] as string | undefined;
    const sessionId = typeof payload.jti === 'string' ? payload.jti : null;
    const issuedAt = typeof payload.iat === 'number' ? payload.iat : null;
    if (!familyId) {
      // Legacy token without family ID - just return userId
      return { userId: payload.sub, familyId: '', sessionId, issuedAt };
    }

    return { userId: payload.sub, familyId, sessionId, issuedAt };
  } catch {
    return null;
  }
}
