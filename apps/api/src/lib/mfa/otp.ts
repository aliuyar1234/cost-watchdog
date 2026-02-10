import { authenticator } from 'otplib';
import { MFA_APP_NAME, TOTP_STEP, TOTP_WINDOW } from './constants.js';

authenticator.options = {
  window: TOTP_WINDOW,
  step: TOTP_STEP,
};

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function generateOtpauthUrl(secret: string, userEmail: string): string {
  return authenticator.keyuri(userEmail, MFA_APP_NAME, secret);
}

export function generateQrCodeDataUrl(otpauthUrl: string): string {
  return `data:text/plain;base64,${Buffer.from(otpauthUrl).toString('base64')}`;
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return authenticator.verify({ token: code, secret });
}
