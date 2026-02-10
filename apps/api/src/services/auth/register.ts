import { randomUUID } from 'crypto';
import { prisma } from '../../lib/db.js';
import { hashPassword, generateTokenPairWithFamily } from '../../lib/auth.js';
import { validatePassword } from '../../lib/password-policy.js';
import { createSession } from '../../lib/sessions.js';
import { createTokenFamily } from '../../lib/token-rotation.js';
import type { AuthContext, AuthLogger, AuthResponse, RegisterInput } from './types.js';

export async function registerUser(
  input: RegisterInput,
  ctx: AuthContext,
  logger?: AuthLogger,
): Promise<AuthResponse> {
  const { email, password, firstName, lastName } = input;

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: 'Password Policy Violation',
      message: 'Password does not meet security requirements',
      statusCode: 400,
      details: passwordValidation.errors,
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    await hashPassword(password);
    return {
      success: false,
      error: 'Registration Failed',
      message: 'Unable to complete registration. Please try again or contact support.',
      statusCode: 400,
    };
  }

  const passwordHash = await hashPassword(password);

  const initialAdminEmail = process.env['INITIAL_ADMIN_EMAIL']?.toLowerCase();
  const userCount = await prisma.user.count();
  const isInitialAdmin =
    userCount === 0 && initialAdminEmail && email.toLowerCase() === initialAdminEmail;
  const role = isInitialAdmin ? 'admin' : 'viewer';

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      role,
      permissions: [],
      isActive: true,
    },
  });

  const familyId = randomUUID();
  const tokens = await generateTokenPairWithFamily(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    familyId,
  );

  try {
    await createTokenFamily(user.id, tokens.refreshToken, familyId);
    await createSession(tokens.sessionId, user.id, ctx.ipAddress, ctx.userAgent);
  } catch (error) {
    logger?.error(error, 'Failed to finalize registration');
    await prisma.user.delete({ where: { id: user.id } }).catch((err) => {
      logger?.error(err, 'Failed to rollback user after registration failure');
    });
    return {
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to complete registration. Please try again.',
      statusCode: 500,
    };
  }

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
  };
}
