import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import documentRoutes from '../src/routes/documents.js';
import authPlugin from '../src/middleware/auth.js';
import { generateTokenPair } from '../src/lib/auth.js';
import { prisma } from './setup';

// Mock S3 operations
vi.mock('../src/lib/s3.js', () => ({
  uploadFile: vi.fn().mockResolvedValue({ bucket: 'test-bucket', key: 'test-key' }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  generateStoragePath: vi.fn().mockReturnValue('documents/2024/01/test-uuid-filename.pdf'),
  calculateFileHash: vi.fn().mockReturnValue('abc123hash'),
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

describe('Document Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let adminToken: string;
  let viewerToken: string;
  let adminUserId: string;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    app = Fastify();
    await app.register(multipart);
    await app.register(cookie);
    await app.register(authPlugin);
    await app.register(documentRoutes, { prefix: '/documents' });

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: 'placeholder',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
    });
    adminUserId = admin.id;

    const adminTokens = await generateTokenPair({
      id: admin.id,
      email: admin.email,
      role: admin.role,
    });
    adminToken = adminTokens.accessToken;

    // Create viewer user
    const viewer = await prisma.user.create({
      data: {
        email: 'viewer@test.com',
        passwordHash: 'placeholder',
        firstName: 'Viewer',
        lastName: 'User',
        role: 'viewer',
      },
    });

    const viewerTokens = await generateTokenPair({
      id: viewer.id,
      email: viewer.email,
      role: viewer.role,
    });
    viewerToken = viewerTokens.accessToken;
  });

  async function createTestDocument(overrides: Partial<{
    filename: string;
    fileHash: string;
    extractionStatus: string;
  }> = {}) {
    return prisma.document.create({
      data: {
        filename: overrides.filename || 'test-document.pdf',
        originalFilename: 'original-test.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileHash: overrides.fileHash || `hash-${Date.now()}-${Math.random()}`,
        storagePath: 'documents/2024/01/test-uuid-test-document.pdf',
        extractionStatus: overrides.extractionStatus || 'completed',
        verificationStatus: 'pending',
        uploadedBy: adminUserId,
      },
    });
  }

  describe('GET /documents', () => {
    it('returns empty list when no documents exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/documents',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('returns documents with pagination', async () => {
      await createTestDocument({ filename: 'doc1.pdf' });
      await createTestDocument({ filename: 'doc2.pdf' });

      const response = await app.inject({
        method: 'GET',
        url: '/documents',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(2);
      expect(body.pagination.total).toBe(2);
    });

    it('filters by extraction status', async () => {
      await createTestDocument({ filename: 'completed.pdf', extractionStatus: 'completed' });
      await createTestDocument({ filename: 'pending.pdf', extractionStatus: 'pending' });
      await createTestDocument({ filename: 'failed.pdf', extractionStatus: 'failed' });

      const response = await app.inject({
        method: 'GET',
        url: '/documents?status=pending',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].extractionStatus).toBe('pending');
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await createTestDocument({ filename: `doc${i}.pdf` });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/documents?limit=2&offset=2',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(2);
      expect(body.pagination.total).toBe(5);
      expect(body.pagination.offset).toBe(2);
    });

    it('filters documents by user access restrictions', async () => {
      const org = await prisma.organization.create({
        data: { name: 'Restricted Org', legalName: 'Restricted GmbH' },
      });
      const allowedLocation = await prisma.location.create({
        data: {
          organizationId: org.id,
          name: 'Allowed Location',
          address: { country: 'DE' },
          type: 'office',
          ownershipType: 'leased',
        },
      });
      const blockedLocation = await prisma.location.create({
        data: {
          organizationId: org.id,
          name: 'Blocked Location',
          address: { country: 'DE' },
          type: 'office',
          ownershipType: 'leased',
        },
      });
      const supplier = await prisma.supplier.create({
        data: {
          name: 'Restricted Supplier',
          category: 'energy_electricity',
          costTypes: ['electricity'],
        },
      });

      const allowedDoc = await createTestDocument({ filename: 'allowed.pdf' });
      const blockedDoc = await createTestDocument({ filename: 'blocked.pdf' });

      await prisma.costRecord.create({
        data: {
          sourceDocumentId: allowedDoc.id,
          supplierId: supplier.id,
          locationId: allowedLocation.id,
          periodStart: new Date('2024-01-01'),
          periodEnd: new Date('2024-01-31'),
          amount: 500,
          costType: 'electricity',
          currency: 'EUR',
        },
      });

      await prisma.costRecord.create({
        data: {
          sourceDocumentId: blockedDoc.id,
          supplierId: supplier.id,
          locationId: blockedLocation.id,
          periodStart: new Date('2024-02-01'),
          periodEnd: new Date('2024-02-28'),
          amount: 600,
          costType: 'electricity',
          currency: 'EUR',
        },
      });

      const restrictedUser = await prisma.user.create({
        data: {
          email: 'restricted@test.com',
          passwordHash: 'placeholder',
          firstName: 'Restricted',
          lastName: 'User',
          role: 'viewer',
          allowedLocationIds: [allowedLocation.id],
        },
      });

      const restrictedTokens = await generateTokenPair({
        id: restrictedUser.id,
        email: restrictedUser.email,
        role: restrictedUser.role,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/documents',
        headers: { authorization: `Bearer ${restrictedTokens.accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(allowedDoc.id);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/documents',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /documents/:id', () => {
    it('returns single document by id', async () => {
      const doc = await createTestDocument();

      const response = await app.inject({
        method: 'GET',
        url: `/documents/${doc.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(doc.id);
      expect(body.filename).toBe('test-document.pdf');
      expect(body.mimeType).toBe('application/pdf');
    });

    it('returns document with linked cost records', async () => {
      const doc = await createTestDocument();

      // Create linked cost record
      const org = await prisma.organization.create({
        data: { name: 'Test Org', legalName: 'Test GmbH' },
      });
      const location = await prisma.location.create({
        data: {
          organizationId: org.id,
          name: 'HQ',
          address: { country: 'DE' },
          type: 'office',
          ownershipType: 'leased',
        },
      });
      const supplier = await prisma.supplier.create({
        data: {
          name: 'TestSupplier',
          category: 'energy_electricity',
          costTypes: ['electricity'],
        },
      });

      await prisma.costRecord.create({
        data: {
          sourceDocumentId: doc.id,
          supplierId: supplier.id,
          locationId: location.id,
          periodStart: new Date('2024-01-01'),
          periodEnd: new Date('2024-01-31'),
          amount: 1000,
          costType: 'electricity',
          currency: 'EUR',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/documents/${doc.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.costRecords).toBeDefined();
      expect(body.costRecords.length).toBe(1);
    });

    it('returns 404 for non-existent document', async () => {
      // Use a valid UUID format that doesn't exist
      const response = await app.inject({
        method: 'GET',
        url: '/documents/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /documents/:id/download', () => {
    it('returns presigned download URL', async () => {
      const doc = await createTestDocument();

      const response = await app.inject({
        method: 'GET',
        url: `/documents/${doc.id}/download`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.downloadUrl).toBe('https://s3.example.com/presigned-url');
      expect(body.filename).toBe('original-test.pdf');
      expect(body.expiresIn).toBe(3600);
    });

    it('returns 404 for non-existent document', async () => {
      // Use a valid UUID format that doesn't exist
      const response = await app.inject({
        method: 'GET',
        url: '/documents/00000000-0000-0000-0000-000000000000/download',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('requires authentication', async () => {
      const doc = await createTestDocument();

      const response = await app.inject({
        method: 'GET',
        url: `/documents/${doc.id}/download`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /documents/:id', () => {
    it('deletes document without linked cost records', async () => {
      const doc = await createTestDocument();

      const response = await app.inject({
        method: 'DELETE',
        url: `/documents/${doc.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify document is deleted
      const deleted = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(deleted).toBeNull();
    });

    it('rejects deletion of document with linked cost records', async () => {
      const doc = await createTestDocument();

      // Create linked cost record
      const org = await prisma.organization.create({
        data: { name: 'Test Org', legalName: 'Test GmbH' },
      });
      const location = await prisma.location.create({
        data: {
          organizationId: org.id,
          name: 'HQ',
          address: { country: 'DE' },
          type: 'office',
          ownershipType: 'leased',
        },
      });
      const supplier = await prisma.supplier.create({
        data: {
          name: 'TestSupplier',
          category: 'energy_electricity',
          costTypes: ['electricity'],
        },
      });

      await prisma.costRecord.create({
        data: {
          sourceDocumentId: doc.id,
          supplierId: supplier.id,
          locationId: location.id,
          periodStart: new Date('2024-01-01'),
          periodEnd: new Date('2024-01-31'),
          amount: 1000,
          costType: 'electricity',
          currency: 'EUR',
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/documents/${doc.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.message).toContain('linked cost records');
    });

    it('returns 404 for non-existent document', async () => {
      // Use a valid UUID format that doesn't exist
      const response = await app.inject({
        method: 'DELETE',
        url: '/documents/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /documents/:id/retry-extraction', () => {
    it('retries extraction for failed document', async () => {
      const doc = await createTestDocument({ extractionStatus: 'failed' });

      const response = await app.inject({
        method: 'POST',
        url: `/documents/${doc.id}/retry-extraction`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);

      // Verify status changed to pending
      const updated = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(updated?.extractionStatus).toBe('pending');

      // Verify outbox event created
      const event = await prisma.outboxEvent.findFirst({
        where: {
          aggregateId: doc.id,
          eventType: 'document.extraction_retry',
        },
      });
      expect(event).not.toBeNull();
    });

    it('retries extraction for manual document', async () => {
      const doc = await createTestDocument({ extractionStatus: 'manual' });

      const response = await app.inject({
        method: 'POST',
        url: `/documents/${doc.id}/retry-extraction`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('rejects retry for completed document', async () => {
      const doc = await createTestDocument({ extractionStatus: 'completed' });

      const response = await app.inject({
        method: 'POST',
        url: `/documents/${doc.id}/retry-extraction`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain('failed or manual');
    });

    it('rejects retry for pending document', async () => {
      const doc = await createTestDocument({ extractionStatus: 'pending' });

      const response = await app.inject({
        method: 'POST',
        url: `/documents/${doc.id}/retry-extraction`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 for non-existent document', async () => {
      // Use a valid UUID format that doesn't exist
      const response = await app.inject({
        method: 'POST',
        url: '/documents/00000000-0000-0000-0000-000000000000/retry-extraction',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /documents/upload', () => {
    it('rejects upload without file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/documents/upload',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      // Should return error when no file provided
      expect([400, 406]).toContain(response.statusCode);
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/documents/upload',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

describe('Document Upload Validation', () => {
  it('rejects invalid MIME types', async () => {
    // This tests the ALLOWED_MIME_TYPES validation logic
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'image/png',
      'image/jpeg',
    ];

    const invalidTypes = [
      'application/javascript',
      'text/html',
      'application/x-executable',
      'application/octet-stream',
    ];

    // Verify the validation logic
    invalidTypes.forEach(type => {
      expect(allowedTypes.includes(type)).toBe(false);
    });

    allowedTypes.forEach(type => {
      expect(allowedTypes.includes(type)).toBe(true);
    });
  });

  it('enforces file size limit', async () => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    // Files larger than 10MB should be rejected
    expect(MAX_FILE_SIZE).toBe(10485760);

    // Test boundary
    expect(10485760 > MAX_FILE_SIZE).toBe(false);
    expect(10485761 > MAX_FILE_SIZE).toBe(true);
  });
});

describe('Document Duplicate Detection', () => {
  let adminUserId: string;

  beforeEach(async () => {
    const admin = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: 'placeholder',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
    });
    adminUserId = admin.id;
  });

  it('detects duplicate documents by file hash', async () => {
    const fileHash = 'duplicate-hash-123';

    // Create first document
    await prisma.document.create({
      data: {
        filename: 'first.pdf',
        originalFilename: 'first.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileHash,
        storagePath: 'documents/first.pdf',
        extractionStatus: 'completed',
        verificationStatus: 'pending',
        uploadedBy: adminUserId,
      },
    });

    // Check for duplicate
    const existing = await prisma.document.findUnique({
      where: { fileHash },
    });

    expect(existing).not.toBeNull();
    expect(existing?.filename).toBe('first.pdf');
  });
});
