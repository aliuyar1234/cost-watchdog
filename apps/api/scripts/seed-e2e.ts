import { randomUUID } from 'crypto';
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth.js';

async function ensureOrganization() {
  const existing = await prisma.organization.findFirst();
  if (existing) return existing;

  return prisma.organization.create({
    data: {
      name: 'E2E Test Org',
    },
  });
}

async function ensureLocation(organizationId: string) {
  const existing = await prisma.location.findFirst({ where: { organizationId } });
  if (existing) return existing;

  return prisma.location.create({
    data: {
      organizationId,
      name: 'HQ',
      type: 'office',
      ownershipType: 'leased',
      address: {
        street: 'Teststraße 1',
        city: 'Berlin',
        postalCode: '10115',
        country: 'DE',
      },
    },
  });
}

async function ensureSupplier() {
  const existing = await prisma.supplier.findFirst({ where: { name: 'E2E Energy GmbH' } });
  if (existing) return existing;

  return prisma.supplier.create({
    data: {
      name: 'E2E Energy GmbH',
      category: 'energy_electricity',
      costTypes: ['electricity'],
      isActive: true,
    },
  });
}

async function ensureAdminUser(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'E2E',
      lastName: 'Admin',
      role: 'admin',
      permissions: [],
    },
  });
}

async function seedDocument(userId: string) {
  return prisma.document.create({
    data: {
      filename: 'seeded-document.pdf',
      originalFilename: 'seeded-document.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      fileHash: `e2e-${randomUUID()}`,
      storagePath: `documents/e2e/${randomUUID()}.pdf`,
      extractionStatus: 'pending',
      verificationStatus: 'pending',
      uploadedBy: userId,
      costTypes: [],
    },
  });
}

async function seedDocumentsForPagination(userId: string, count: number) {
  const documents = Array.from({ length: count }, (_, idx) => {
    const basename = `seeded-document-${String(idx + 1).padStart(2, '0')}.pdf`;
    return {
      filename: basename,
      originalFilename: basename,
      mimeType: 'application/pdf',
      fileSize: 1024,
      fileHash: `e2e-${randomUUID()}`,
      storagePath: `documents/e2e/${randomUUID()}.pdf`,
      extractionStatus: 'pending',
      verificationStatus: 'pending',
      uploadedBy: userId,
      costTypes: [],
    };
  });

  await prisma.document.createMany({
    data: documents,
  });
}

async function seedCostRecord(args: {
  supplierId: string;
  locationId: string;
  sourceDocumentId: string;
}) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return prisma.costRecord.create({
    data: {
      supplierId: args.supplierId,
      locationId: args.locationId,
      sourceDocumentId: args.sourceDocumentId,
      costType: 'electricity',
      periodStart: start,
      periodEnd: end,
      amount: 123.45,
      currency: 'EUR',
      anomalyStatus: 'warning',
    },
  });
}

async function seedAnomaly(costRecordId: string) {
  return prisma.anomaly.create({
    data: {
      costRecordId,
      type: 'yoy_deviation',
      severity: 'warning',
      message: 'E2E test anomaly',
      details: {},
      status: 'new',
      isBackfill: false,
    },
  });
}

async function main() {
  const email = process.env['E2E_ADMIN_EMAIL'] || 'admin@example.com';
  const password = process.env['E2E_ADMIN_PASSWORD'] || 'Password123!';

  const org = await ensureOrganization();
  const location = await ensureLocation(org.id);
  const supplier = await ensureSupplier();
  const user = await ensureAdminUser(email, password);

  const document = await seedDocument(user.id);
  await seedDocumentsForPagination(user.id, 30);
  const costRecord = await seedCostRecord({
    supplierId: supplier.id,
    locationId: location.id,
    sourceDocumentId: document.id,
  });
  await seedAnomaly(costRecord.id);

  // eslint-disable-next-line no-console
  console.log(`[e2e seed] Created admin user: ${email}`);
  // eslint-disable-next-line no-console
  console.log('[e2e seed] Done');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[e2e seed] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
