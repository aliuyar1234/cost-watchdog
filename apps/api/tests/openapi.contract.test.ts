import { describe, it, expect } from 'vitest';
import { openApiSpec } from '../src/lib/openapi.js';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as UnknownRecord;
}

function get(value: unknown, key: string): unknown {
  return asRecord(value)?.[key];
}

describe('OpenAPI contract', () => {
  it('includes the critical auth routes used by the web client', () => {
    const paths = openApiSpec.paths as Record<string, unknown>;

    for (const path of [
      '/auth/register',
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/auth/me',
    ]) {
      expect(paths[path]).toBeTruthy();
    }
  });

  it('documents auth responses that include refresh tokens', () => {
    const paths = openApiSpec.paths as unknown;

    const loginSchema = get(
      get(
        get(get(get(get(get(paths, '/auth/login'), 'post'), 'responses'), '200'), 'content'),
        'application/json',
      ),
      'schema',
    );
    const registerSchema = get(
      get(
        get(get(get(get(get(paths, '/auth/register'), 'post'), 'responses'), '201'), 'content'),
        'application/json',
      ),
      'schema',
    );

    expect(get(get(loginSchema, 'properties'), 'refreshToken')).toBeTruthy();
    expect(get(get(registerSchema, 'properties'), 'refreshToken')).toBeTruthy();
  });

  it('does not claim that the first registered user becomes admin by default', () => {
    const paths = openApiSpec.paths as unknown;

    const description = get(get(get(paths, '/auth/register'), 'post'), 'description');
    expect(description).toBeTruthy();
    expect(description).toContain('INITIAL_ADMIN_EMAIL');
  });

  it('keeps Document schema aligned with the API response shape', () => {
    const documentSchema = get(get(openApiSpec.components as unknown, 'schemas'), 'Document');
    const properties = get(documentSchema, 'properties');

    expect(get(properties, 'originalFilename')).toBeTruthy();
    expect(get(properties, 'fileSize')).toBeTruthy();
    expect(get(properties, 'verificationStatus')).toBeTruthy();
  });
});
