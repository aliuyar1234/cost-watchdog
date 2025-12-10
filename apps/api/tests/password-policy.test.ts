import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  getPasswordRequirements,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  passwordSchema,
} from '../src/lib/password-policy.js';

describe('Password Policy', () => {
  describe('validatePassword', () => {
    it('should accept a valid password with all requirements', () => {
      const result = validatePassword('SecureP@ss123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password shorter than minimum length', () => {
      const result = validatePassword('Short1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    });

    it('should reject password longer than maximum length', () => {
      const longPassword = 'A'.repeat(PASSWORD_MAX_LENGTH + 1) + 'a1!';
      const result = validatePassword(longPassword);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
    });

    it('should reject password without uppercase letter', () => {
      const result = validatePassword('lowercase123!@#');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter (A-Z)');
    });

    it('should reject password without lowercase letter', () => {
      const result = validatePassword('UPPERCASE123!@#');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter (a-z)');
    });

    it('should reject password without number', () => {
      const result = validatePassword('NoNumbers!@#Abc');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number (0-9)');
    });

    it('should reject password without special character', () => {
      const result = validatePassword('NoSpecial123Abc');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character (!@#$%^&*...)');
    });

    it('should return multiple errors for multiple violations', () => {
      const result = validatePassword('short');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should accept passwords with various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '='];

      for (const char of specialChars) {
        const password = `ValidPass123${char}`;
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept password at exactly minimum length', () => {
      // 12 chars: ValidP@ss12!
      const result = validatePassword('ValidP@ss12!');
      expect(result.valid).toBe(true);
    });

    it('should accept password at exactly maximum length', () => {
      const base = 'ValidP@ss1';
      const padding = 'a'.repeat(PASSWORD_MAX_LENGTH - base.length - 1);
      const password = base + padding + '!';
      const result = validatePassword(password);
      expect(result.valid).toBe(true);
    });
  });

  describe('getPasswordRequirements', () => {
    it('should return an array of requirements', () => {
      const requirements = getPasswordRequirements();
      expect(Array.isArray(requirements)).toBe(true);
      expect(requirements.length).toBe(5);
    });

    it('should include minimum length requirement', () => {
      const requirements = getPasswordRequirements();
      expect(requirements.some(r => r.includes(`${PASSWORD_MIN_LENGTH}`))).toBe(true);
    });

    it('should include uppercase requirement', () => {
      const requirements = getPasswordRequirements();
      expect(requirements.some(r => r.toLowerCase().includes('uppercase'))).toBe(true);
    });

    it('should include lowercase requirement', () => {
      const requirements = getPasswordRequirements();
      expect(requirements.some(r => r.toLowerCase().includes('lowercase'))).toBe(true);
    });

    it('should include number requirement', () => {
      const requirements = getPasswordRequirements();
      expect(requirements.some(r => r.toLowerCase().includes('number'))).toBe(true);
    });

    it('should include special character requirement', () => {
      const requirements = getPasswordRequirements();
      expect(requirements.some(r => r.toLowerCase().includes('special'))).toBe(true);
    });
  });

  describe('passwordSchema (Zod)', () => {
    it('should parse valid password', () => {
      const result = passwordSchema.safeParse('ValidP@ssword123');
      expect(result.success).toBe(true);
    });

    it('should reject short password', () => {
      const result = passwordSchema.safeParse('Short1!');
      expect(result.success).toBe(false);
    });

    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse('nouppercase123!@');
      expect(result.success).toBe(false);
    });

    it('should reject password without lowercase', () => {
      const result = passwordSchema.safeParse('NOLOWERCASE123!@');
      expect(result.success).toBe(false);
    });

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse('NoNumbers!@#Abcd');
      expect(result.success).toBe(false);
    });

    it('should reject password without special', () => {
      const result = passwordSchema.safeParse('NoSpecial123Abcd');
      expect(result.success).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should have minimum length of 12', () => {
      expect(PASSWORD_MIN_LENGTH).toBe(12);
    });

    it('should have maximum length of 128', () => {
      expect(PASSWORD_MAX_LENGTH).toBe(128);
    });
  });
});
