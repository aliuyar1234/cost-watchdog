#!/usr/bin/env npx tsx

/**
 * Encryption Key Rotation Script
 *
 * This script rotates the field encryption key by re-encrypting all
 * sensitive fields with a new key while maintaining access to the old key
 * for decryption.
 *
 * Usage:
 *   npx tsx scripts/rotate-encryption-key.ts
 *
 * Environment Variables:
 *   FIELD_ENCRYPTION_KEY         - Current encryption key (new key to rotate TO)
 *   FIELD_ENCRYPTION_KEY_VERSION - Version of current key (e.g., 2)
 *   FIELD_ENCRYPTION_KEY_LEGACY_1 - Old key version 1 (if rotating from v1)
 *   DATABASE_URL                 - Database connection string
 *
 * Process:
 *   1. Load both old and new keys
 *   2. Find all records with encrypted fields using old key version
 *   3. Re-encrypt each field with the new key
 *   4. Update records in batches
 *   5. Report progress and summary
 */

import { PrismaClient } from '@prisma/client';
import {
  initializeFromEnv,
  needsReEncryption,
  reEncrypt,
  getKeyVersion,
  isEncrypted,
} from '../src/lib/field-encryption.js';
import {
  getModelsWithEncryption,
  getEncryptionConfig,
} from '../src/lib/prisma-encryption-middleware.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       Encryption Key Rotation Script');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (DRY_RUN) {
    console.log('  DRY RUN MODE - No changes will be made');
    console.log('');
  }

  // Initialize encryption
  try {
    initializeFromEnv();
    console.log('  Encryption initialized successfully');
  } catch (error) {
    console.error('  Failed to initialize encryption:', error);
    process.exit(1);
  }

  // Initialize Prisma
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('  Database connected');
    console.log('');

    const config = getEncryptionConfig();
    const models = getModelsWithEncryption();

    console.log('  Models with encrypted fields:');
    for (const model of models) {
      console.log(`    - ${model}: ${config[model].join(', ')}`);
    }
    console.log('');

    let totalProcessed = 0;
    let totalReEncrypted = 0;
    let totalErrors = 0;

    // Process CostRecord model (the main model with encrypted fields)
    if (config['CostRecord']) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  Processing CostRecord table...');
      console.log('═══════════════════════════════════════════════════════════════');

      const encryptedFields = config['CostRecord'];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // Fetch batch of records
        const records = await prisma.costRecord.findMany({
          select: {
            id: true,
            invoiceNumber: true,
            contractNumber: true,
          },
          skip: offset,
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
        });

        if (records.length === 0) {
          hasMore = false;
          break;
        }

        for (const record of records) {
          totalProcessed++;
          let needsUpdate = false;
          const updates: Record<string, string> = {};

          for (const field of encryptedFields) {
            const value = record[field as keyof typeof record];
            if (typeof value === 'string' && isEncrypted(value)) {
              try {
                if (needsReEncryption(value)) {
                  const oldVersion = getKeyVersion(value);
                  const newValue = reEncrypt(value);
                  const newVersion = getKeyVersion(newValue);
                  updates[field] = newValue;
                  needsUpdate = true;
                  console.log(
                    `    Record ${record.id}: ${field} v${oldVersion} -> v${newVersion}`
                  );
                }
              } catch (error) {
                totalErrors++;
                console.error(
                  `    ERROR: Record ${record.id}, field ${field}:`,
                  error instanceof Error ? error.message : error
                );
              }
            }
          }

          if (needsUpdate && !DRY_RUN) {
            try {
              await prisma.costRecord.update({
                where: { id: record.id },
                data: updates,
              });
              totalReEncrypted++;
            } catch (error) {
              totalErrors++;
              console.error(
                `    ERROR: Failed to update record ${record.id}:`,
                error instanceof Error ? error.message : error
              );
            }
          } else if (needsUpdate) {
            totalReEncrypted++;
          }
        }

        offset += records.length;
        if (offset % 1000 === 0) {
          console.log(`    Processed ${offset} records...`);
        }

        hasMore = records.length === BATCH_SIZE;
      }
    }

    // Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`    Records processed:   ${totalProcessed}`);
    console.log(`    Records re-encrypted: ${totalReEncrypted}`);
    console.log(`    Errors:              ${totalErrors}`);
    console.log('');

    if (DRY_RUN) {
      console.log('  DRY RUN COMPLETE - No changes were made');
      console.log('  Run without --dry-run to apply changes');
    } else {
      console.log('  KEY ROTATION COMPLETE');
    }

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
