export interface AuthContext {
  requestId: string;
  ipAddress: string;
  userAgent: string | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UserDTO {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface AuthResult {
  success: true;
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface AuthError {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
  retryAfter?: number;
  securityEvent?: boolean;
}

export type AuthResponse = AuthResult | AuthError;

export interface RefreshResult {
  success: true;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export type RefreshResponse = RefreshResult | AuthError;

export interface LogoutResult {
  success: true;
  message: string;
}

export interface PasswordResetRequestResult {
  success: true;
  message: string;
  token?: string;
}

export interface PasswordResetResult {
  success: true;
  message: string;
}

export interface AuthLogger {
  error: (err: unknown, msg: string) => void;
}
