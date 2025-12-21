import { PrismaClient, Prisma } from '@prisma/client';
import { secrets } from './secrets.js';

/**
 * Hydrate DATABASE_URL from Docker secrets before Prisma initialization.
 * Prisma reads DATABASE_URL from process.env, so we must set it first.
 * This runs at module load time, before PrismaClient is instantiated.
 */
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
const LOG_QUERIES = process.env['PRISMA_LOG_QUERIES'] === 'true';

if (!process.env['DATABASE_URL']) {
  const dbUrl = secrets.getDatabaseUrl();
  if (dbUrl) {
    process.env['DATABASE_URL'] = dbUrl;
  } else if (IS_PRODUCTION) {
    throw new Error(
      'FATAL: DATABASE_URL not found. ' +
      'Provide via Docker secret at /run/secrets/db_url or DATABASE_URL env var.'
    );
  }
}

/**
 * Global Prisma client instance.
 * In development, we reuse the same instance across hot reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: IS_PRODUCTION
      ? ['error']
      : LOG_QUERIES
        ? (['query', 'error', 'warn'] as Prisma.LogLevel[])
        : (['error', 'warn'] as Prisma.LogLevel[]),
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Transaction client type for use in transaction callbacks.
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Execute database operations within a transaction.
 *
 * Single-tenant architecture: No RLS or tenant isolation needed.
 * Each deployment serves one customer.
 *
 * @example
 * ```typescript
 * const records = await withTransaction(async (tx) => {
 *   return tx.costRecord.findMany();
 * });
 * ```
 *
 * @param callback - The async function to execute within the transaction
 * @returns The result of the callback
 */
export async function withTransaction<T>(
  callback: (tx: PrismaTransaction) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    return callback(tx);
  });
}

/**
 * Execute database operations within a transaction with extended options.
 *
 * Use this when you need to customize transaction behavior (timeout, isolation level).
 *
 * @param callback - The async function to execute
 * @param options - Prisma transaction options
 * @returns The result of the callback
 */
export async function withTransactionExtended<T>(
  callback: (tx: PrismaTransaction) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      return callback(tx);
    },
    {
      maxWait: options?.maxWait ?? 5000,
      timeout: options?.timeout ?? 10000,
      isolationLevel: options?.isolationLevel,
    }
  );
}

/**
 * Health check for database connection.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully disconnect from database.
 * Call this on application shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
