import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from './setup';
import { uploadDocument } from '../src/services/document/upload.js';
import { PDF_LLM_KEY_MISSING_UPLOAD_REASON } from '../src/lib/ingest-policy.js';

describe('Document upload ingest policy', () => {
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
      return;
    }

    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
  });

  async function createUser() {
    return prisma.user.create({
      data: {
        email: `policy-user-${Date.now()}-${Math.random()}@test.com`,
        passwordHash: 'placeholder',
        firstName: 'Policy',
        lastName: 'Tester',
        role: 'admin',
      },
    });
  }

  it('rejects legacy spreadsheet uploads and keeps CSV as primary ingest', async () => {
    const user = await createUser();

    const result = await uploadDocument(
      {
        buffer: Buffer.from('not-used', 'utf8'),
        filename: 'legacy.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      user.id,
      {
        requestId: 'test-request',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      },
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected upload to fail');
    }

    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('Supported ingest types');
    expect(result.message).toContain('text/csv');
    expect(result.message).toContain('application/pdf');
  });

  it('rejects PDF upload when LLM key is not configured', async () => {
    const user = await createUser();
    delete process.env.ANTHROPIC_API_KEY;

    const result = await uploadDocument(
      {
        buffer: Buffer.from('%PDF-1.4 test content', 'utf8'),
        filename: 'missing-key.pdf',
        mimetype: 'application/pdf',
      },
      user.id,
      {
        requestId: 'test-request',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      },
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected upload to fail');
    }

    expect(result.statusCode).toBe(422);
    expect(result.message).toBe(PDF_LLM_KEY_MISSING_UPLOAD_REASON);
  });
});
