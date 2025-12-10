/**
 * MFA Tests
 *
 * Tests for multi-factor authentication functionality.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  generateOtpauthUrl,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
  isMfaRequiredForRole,
} from '../src/lib/mfa.js';
import { initializeFromEnv } from '../src/lib/field-encryption.js';

// Initialize encryption for tests
beforeAll(() => {
  initializeFromEnv();
});

describe('MFA', () => {
  describe('generateTotpSecret', () => {
    it('should generate a valid TOTP secret', () => {
      const secret = generateTotpSecret();

      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThanOrEqual(16);
      // Should be base32 encoded
      expect(/^[A-Z2-7]+=*$/.test(secret)).toBe(true);
    });

    it('should generate unique secrets', () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 10; i++) {
        secrets.add(generateTotpSecret());
      }
      expect(secrets.size).toBe(10);
    });
  });

  describe('generateOtpauthUrl', () => {
    it('should generate a valid otpauth URL', () => {
      const secret = generateTotpSecret();
      const email = 'test@example.com';

      const url = generateOtpauthUrl(secret, email);

      expect(url).toContain('otpauth://totp/');
      expect(url).toContain('CostWatchdog');
      expect(url).toContain(encodeURIComponent(email));
      expect(url).toContain(`secret=${secret}`);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 10 backup codes by default', () => {
      const codes = generateBackupCodes();

      expect(codes).toHaveLength(10);
    });

    it('should generate specified number of codes', () => {
      const codes = generateBackupCodes(5);

      expect(codes).toHaveLength(5);
    });

    it('should generate codes in XXXX-XXXX format', () => {
      const codes = generateBackupCodes();

      codes.forEach((code) => {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      });
    });

    it('should generate unique codes', () => {
      const codes = generateBackupCodes();
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('hashBackupCodes', () => {
    it('should hash all backup codes', async () => {
      const codes = generateBackupCodes(3);
      const hashed = await hashBackupCodes(codes);

      expect(hashed).toHaveLength(3);
      hashed.forEach((hash) => {
        expect(hash).toBeDefined();
        // Argon2 hashes start with $argon2
        expect(hash).toMatch(/^\$argon2/);
      });
    });

    it('should produce different hashes for different codes', async () => {
      const codes = ['AAAA-BBBB', 'CCCC-DDDD'];
      const hashed = await hashBackupCodes(codes);

      expect(hashed[0]).not.toBe(hashed[1]);
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify a valid backup code', async () => {
      const codes = ['ABCD-1234'];
      const hashed = await hashBackupCodes(codes);

      const index = await verifyBackupCode('ABCD-1234', hashed);

      expect(index).toBe(0);
    });

    it('should verify code without dashes', async () => {
      const codes = ['ABCD-1234'];
      const hashed = await hashBackupCodes(codes);

      const index = await verifyBackupCode('ABCD1234', hashed);

      expect(index).toBe(0);
    });

    it('should verify case-insensitively', async () => {
      const codes = ['ABCD-1234'];
      const hashed = await hashBackupCodes(codes);

      const index = await verifyBackupCode('abcd-1234', hashed);

      expect(index).toBe(0);
    });

    it('should return null for invalid code', async () => {
      const codes = ['ABCD-1234'];
      const hashed = await hashBackupCodes(codes);

      const index = await verifyBackupCode('WRONG-CODE', hashed);

      expect(index).toBeNull();
    });

    it('should find code in list', async () => {
      const codes = ['AAAA-1111', 'BBBB-2222', 'CCCC-3333'];
      const hashed = await hashBackupCodes(codes);

      const index = await verifyBackupCode('BBBB-2222', hashed);

      expect(index).toBe(1);
    });
  });

  describe('TOTP verification', () => {
    it('should verify a valid TOTP code', () => {
      const secret = generateTotpSecret();
      const code = authenticator.generate(secret);

      const isValid = authenticator.verify({ token: code, secret });

      expect(isValid).toBe(true);
    });

    it('should reject an invalid TOTP code', () => {
      const secret = generateTotpSecret();

      const isValid = authenticator.verify({ token: '000000', secret });

      expect(isValid).toBe(false);
    });

    it('should reject wrong length codes', () => {
      const secret = generateTotpSecret();

      const isValid = authenticator.verify({ token: '123', secret });

      expect(isValid).toBe(false);
    });
  });

  describe('isMfaRequiredForRole', () => {
    it('should require MFA for admin role', () => {
      expect(isMfaRequiredForRole('admin')).toBe(true);
    });

    it('should not require MFA for manager role', () => {
      expect(isMfaRequiredForRole('manager')).toBe(false);
    });

    it('should not require MFA for analyst role', () => {
      expect(isMfaRequiredForRole('analyst')).toBe(false);
    });

    it('should not require MFA for viewer role', () => {
      expect(isMfaRequiredForRole('viewer')).toBe(false);
    });
  });
});
