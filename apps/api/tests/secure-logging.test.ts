import { describe, it, expect } from 'vitest';
import {
  redactHeader,
  redactHeaders,
  redactObject,
  redactString,
  requestSerializer,
  responseSerializer,
  errorSerializer,
  getSecureLoggerConfig,
} from '../src/middleware/secure-logging.js';

describe('Secure Logging', () => {
  describe('redactHeader', () => {
    it('should redact authorization header', () => {
      const result = redactHeader('authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9...');
      expect(result).toBe('Bearer [REDACTED]');
      expect(result).not.toContain('eyJ');
    });

    it('should redact x-api-key header', () => {
      const result = redactHeader('x-api-key', 'cw_secret_key_12345');
      expect(result).toBe('[REDACTED]');
      expect(result).not.toContain('secret');
    });

    it('should redact cookie header', () => {
      const result = redactHeader('cookie', 'session=abc123; token=xyz789');
      expect(result).toBe('[REDACTED]');
    });

    it('should redact set-cookie header', () => {
      const result = redactHeader('set-cookie', 'accessToken=secret; HttpOnly');
      expect(result).toBe('[REDACTED]');
    });

    it('should redact x-csrf-token header', () => {
      const result = redactHeader('x-csrf-token', 'csrf-token-value');
      expect(result).toBe('[REDACTED]');
    });

    it('should not redact non-sensitive headers', () => {
      const result = redactHeader('content-type', 'application/json');
      expect(result).toBe('application/json');
    });

    it('should handle case-insensitive header names', () => {
      const result = redactHeader('AUTHORIZATION', 'Bearer token');
      expect(result).toBe('Bearer [REDACTED]');
    });

    it('should handle empty values', () => {
      const result = redactHeader('authorization', undefined);
      expect(result).toBe('[empty]');
    });

    it('should handle array values', () => {
      const result = redactHeader('content-type', ['application/json', 'text/plain']);
      expect(result).toBe('application/json, text/plain');
    });
  });

  describe('redactHeaders', () => {
    it('should redact all sensitive headers', () => {
      const headers = {
        authorization: 'Bearer token123',
        'x-api-key': 'api-key-secret',
        cookie: 'session=abc',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result.authorization).toBe('Bearer [REDACTED]');
      expect(result['x-api-key']).toBe('[REDACTED]');
      expect(result.cookie).toBe('[REDACTED]');
      expect(result['content-type']).toBe('application/json');
    });
  });

  describe('redactString', () => {
    it('should redact email addresses', () => {
      const result = redactString('User john.doe@example.com logged in');
      expect(result).toBe('User j***@example.com logged in');
      expect(result).not.toContain('john.doe');
    });

    it('should redact multiple email addresses', () => {
      const result = redactString('From alice@foo.com to bob@bar.org');
      expect(result).toBe('From a***@foo.com to b***@bar.org');
    });

    it('should not affect non-email strings', () => {
      const result = redactString('This is a normal log message');
      expect(result).toBe('This is a normal log message');
    });

    it('should handle email with numbers', () => {
      const result = redactString('user123@domain.com');
      expect(result).toBe('u***@domain.com');
    });
  });

  describe('redactObject', () => {
    it('should redact password fields', () => {
      const obj = { username: 'john', password: 'secret123' };
      const result = redactObject(obj) as Record<string, unknown>;

      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
    });

    it('should redact token fields', () => {
      const obj = { refreshToken: 'token123', accessToken: 'token456' };
      const result = redactObject(obj) as Record<string, unknown>;

      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.accessToken).toBe('[REDACTED]');
    });

    it('should redact nested password fields', () => {
      const obj = {
        user: {
          name: 'john',
          credentials: {
            password: 'secret',
          },
        },
      };
      const result = redactObject(obj) as Record<string, Record<string, unknown>>;

      expect(result.user.name).toBe('john');
      expect((result.user.credentials as Record<string, unknown>).password).toBe('[REDACTED]');
    });

    it('should redact mfa codes', () => {
      const obj = { mfaCode: '123456', totpCode: '654321' };
      const result = redactObject(obj) as Record<string, unknown>;

      expect(result.mfaCode).toBe('[REDACTED]');
      expect(result.totpCode).toBe('[REDACTED]');
    });

    it('should redact backup codes', () => {
      const obj = { backupCode: 'abc-123-xyz' };
      const result = redactObject(obj) as Record<string, unknown>;

      expect(result.backupCode).toBe('[REDACTED]');
    });

    it('should redact API keys', () => {
      const obj = { apiKey: 'cw_secret_key' };
      const result = redactObject(obj) as Record<string, unknown>;

      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const obj = [{ password: 'secret1' }, { password: 'secret2' }];
      const result = redactObject(obj) as Record<string, unknown>[];

      expect(result[0].password).toBe('[REDACTED]');
      expect(result[1].password).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(redactObject(null)).toBe(null);
      expect(redactObject(undefined)).toBe(undefined);
    });

    it('should redact email strings in values', () => {
      const obj = { message: 'Email sent to john@example.com' };
      const result = redactObject(obj) as Record<string, unknown>;

      expect(result.message).toBe('Email sent to j***@example.com');
    });

    it('should handle case-insensitive field names', () => {
      const obj = { PASSWORD: 'secret', NewPassword: 'newsecret' };
      const result = redactObject(obj) as Record<string, unknown>;

      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.NewPassword).toBe('[REDACTED]');
    });
  });

  describe('requestSerializer', () => {
    it('should serialize basic request info', () => {
      const request = {
        method: 'POST',
        url: '/api/login',
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      };

      const result = requestSerializer(request);

      expect(result.method).toBe('POST');
      expect(result.url).toBe('/api/login');
      expect((result.headers as Record<string, string>).authorization).toBe('Bearer [REDACTED]');
      expect((result.headers as Record<string, string>)['content-type']).toBe('application/json');
    });

    it('should handle missing headers', () => {
      const request = { method: 'GET', url: '/health' };
      const result = requestSerializer(request);

      expect(result.headers).toBeUndefined();
    });
  });

  describe('responseSerializer', () => {
    it('should serialize response info', () => {
      const response = {
        statusCode: 200,
        headers: {
          'set-cookie': 'session=abc',
          'content-type': 'application/json',
        },
      };

      const result = responseSerializer(response);

      expect(result.statusCode).toBe(200);
      expect((result.headers as Record<string, string>)['set-cookie']).toBe('[REDACTED]');
    });
  });

  describe('errorSerializer', () => {
    it('should serialize error info', () => {
      const error = new Error('User john@example.com not found');

      const result = errorSerializer(error);

      expect(result.type).toBe('Error');
      expect(result.message).toBe('User j***@example.com not found');
    });

    it('should include error code if present', () => {
      const error = Object.assign(new Error('Not found'), { code: 'NOT_FOUND', statusCode: 404 });

      const result = errorSerializer(error);

      expect(result.code).toBe('NOT_FOUND');
      expect(result.statusCode).toBe(404);
    });

    it('should hide stack in production', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      const error = new Error('Test error');
      const result = errorSerializer(error);

      // In production, stack is hidden (returns '[hidden]' instead of actual stack)
      expect(result.stack).toBe('[hidden]');

      process.env['NODE_ENV'] = originalEnv;
    });
  });

  describe('getSecureLoggerConfig', () => {
    it('should return serializers object', () => {
      const config = getSecureLoggerConfig();

      expect(config.serializers).toBeDefined();
      expect(config.serializers.req).toBeTypeOf('function');
      expect(config.serializers.res).toBeTypeOf('function');
      expect(config.serializers.err).toBeTypeOf('function');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle login request logging', () => {
      const request = {
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          email: 'user@example.com',
          password: 'mysecretpassword',
        },
      };

      const serializedReq = requestSerializer(request);
      const redactedBody = redactObject(request.body) as Record<string, unknown>;

      expect(serializedReq.method).toBe('POST');
      expect(redactedBody.email).toBe('u***@example.com');
      expect(redactedBody.password).toBe('[REDACTED]');
    });

    it('should handle token refresh logging', () => {
      const request = {
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          cookie: 'refreshToken=secrettoken123',
        },
        body: {
          refreshToken: 'secrettoken123',
        },
      };

      const serializedReq = requestSerializer(request);
      const redactedBody = redactObject(request.body) as Record<string, unknown>;

      expect((serializedReq.headers as Record<string, string>).authorization).toBe('Bearer [REDACTED]');
      expect((serializedReq.headers as Record<string, string>).cookie).toBe('[REDACTED]');
      expect(redactedBody.refreshToken).toBe('[REDACTED]');
    });

    it('should handle MFA verification logging', () => {
      const body = {
        userId: '123',
        mfaCode: '123456',
        backupCode: 'ABC-123-XYZ',
      };

      const redacted = redactObject(body) as Record<string, unknown>;

      expect(redacted.userId).toBe('123');
      expect(redacted.mfaCode).toBe('[REDACTED]');
      expect(redacted.backupCode).toBe('[REDACTED]');
    });

    it('should handle password reset logging', () => {
      const body = {
        email: 'user@example.com',
        token: 'reset-token-secret',
        newPassword: 'newpassword123',
        passwordConfirm: 'newpassword123',
      };

      const redacted = redactObject(body) as Record<string, unknown>;

      expect(redacted.email).toBe('u***@example.com');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.newPassword).toBe('[REDACTED]');
      expect(redacted.passwordConfirm).toBe('[REDACTED]');
    });
  });
});
