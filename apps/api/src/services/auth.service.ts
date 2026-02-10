import { registerUser } from './auth/register.js';
import { loginUser } from './auth/login.js';
import { refreshTokens } from './auth/refresh.js';
import { logoutUser } from './auth/logout.js';
import { requestPasswordReset, resetPasswordWithToken } from './auth/password-reset.js';
import { getCurrentUser } from './auth/current-user.js';
import type {
  AuthContext,
  AuthError,
  AuthLogger,
  AuthResponse,
  LoginInput,
  LogoutResult,
  PasswordResetRequestResult,
  PasswordResetResult,
  RefreshResponse,
  RegisterInput,
  UserDTO,
} from './auth/types.js';

export type {
  AuthContext,
  AuthError,
  AuthResponse,
  LoginInput,
  LogoutResult,
  PasswordResetRequestResult,
  PasswordResetResult,
  RefreshResponse,
  RegisterInput,
  UserDTO,
};

export class AuthService {
  async register(
    input: RegisterInput,
    ctx: AuthContext,
    logger?: AuthLogger,
  ): Promise<AuthResponse> {
    return registerUser(input, ctx, logger);
  }

  async login(input: LoginInput, ctx: AuthContext, logger?: AuthLogger): Promise<AuthResponse> {
    return loginUser(input, ctx, logger);
  }

  async refresh(
    refreshToken: string,
    ctx: AuthContext,
    logger?: AuthLogger,
  ): Promise<RefreshResponse> {
    return refreshTokens(refreshToken, ctx, logger);
  }

  async logout(
    userId: string | undefined,
    sessionId: string | undefined,
    accessToken: string | undefined,
    refreshToken: string | undefined,
    ctx: AuthContext,
    logger?: AuthLogger,
  ): Promise<LogoutResult> {
    return logoutUser({ userId, sessionId, accessToken, refreshToken, ctx, logger });
  }

  async requestPasswordReset(
    email: string,
    ctx: AuthContext,
    logger?: AuthLogger,
  ): Promise<PasswordResetRequestResult | AuthError> {
    return requestPasswordReset(email, ctx, logger);
  }

  async resetPassword(
    token: string,
    newPassword: string,
    ctx: AuthContext,
    logger?: AuthLogger,
  ): Promise<PasswordResetResult | AuthError> {
    return resetPasswordWithToken(token, newPassword, ctx, logger);
  }

  async getCurrentUser(userId: string): Promise<UserDTO | null> {
    return getCurrentUser(userId);
  }
}

export const authService = new AuthService();
