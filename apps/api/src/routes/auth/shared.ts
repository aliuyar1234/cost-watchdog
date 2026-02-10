import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuditContext } from '../../middleware/request-context.js';
import type { AuthContext } from '../../services/auth.service.js';

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? ('strict' as const) : ('lax' as const),
  path: '/',
};

export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
): void {
  reply.setCookie('accessToken', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60,
  });
  reply.setCookie('refreshToken', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('accessToken', COOKIE_OPTIONS);
  reply.clearCookie('refreshToken', COOKIE_OPTIONS);
}

export function shouldReturnTokens(request: FastifyRequest): boolean {
  return !request.headers.origin;
}

export function getAuthContext(request: FastifyRequest): AuthContext {
  const ctx = getAuditContext(request);
  return {
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress || request.ip,
    userAgent: ctx.userAgent,
  };
}
