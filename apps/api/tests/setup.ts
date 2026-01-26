import { beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });

function getDatabaseName(databaseUrl: string): string | null {
  try {
    const url = new URL(databaseUrl);
    const name = url.pathname.replace(/^\//, '').trim();
    return name || null;
  } catch {
    return null;
  }
}

function assertSafeTestDatabase(): void {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set for tests');
  }

  const dbName = getDatabaseName(databaseUrl);
  if (!dbName) {
    throw new Error('Could not determine database name from DATABASE_URL');
  }

  // Safety: never truncate a non-test database.
  const allowUnsafe = process.env['ALLOW_UNSAFE_TEST_DB_RESET'] === 'true';
  if (!allowUnsafe && !dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run destructive test cleanup on database '${dbName}'. ` +
        `Use a *_test database or set ALLOW_UNSAFE_TEST_DB_RESET=true (not recommended).`,
    );
  }
}

function assertSafeTestRedis(): void {
  const allowUnsafe = process.env['ALLOW_UNSAFE_TEST_REDIS_RESET'] === 'true';
  if (allowUnsafe) return;

  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error('Refusing to run destructive Redis cleanup outside NODE_ENV=test');
  }

  try {
    const url = new URL(redisUrl);
    const host = (url.hostname || '').toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(
        `Refusing to flush Redis at host '${host}'. ` +
          `Set ALLOW_UNSAFE_TEST_REDIS_RESET=true to override (not recommended).`,
      );
    }
  } catch {
    throw new Error('Could not parse REDIS_URL for safety checks');
  }
}

beforeAll(async () => {
  // Connect to test database
  assertSafeTestDatabase();
  await prisma.$connect();
  assertSafeTestRedis();
  await redis.ping();
});

afterEach(async () => {
  // Clean up test data after each test
  assertSafeTestDatabase();
  const tablenames = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ');

  if (tables.length > 0) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch {
      // Ignore errors during cleanup
    }
  }

  assertSafeTestRedis();
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

export { prisma };
