-- Normalize list columns to be non-null with empty-array defaults.
-- This matches Prisma's non-null `String[]` fields and avoids runtime `null` surprises.

-- AlterTable: users
UPDATE "users" SET "allowed_location_ids" = ARRAY[]::UUID[] WHERE "allowed_location_ids" IS NULL;
ALTER TABLE "users" ALTER COLUMN "allowed_location_ids" SET DEFAULT ARRAY[]::UUID[];
ALTER TABLE "users" ALTER COLUMN "allowed_location_ids" SET NOT NULL;

UPDATE "users" SET "allowed_cost_center_ids" = ARRAY[]::UUID[] WHERE "allowed_cost_center_ids" IS NULL;
ALTER TABLE "users" ALTER COLUMN "allowed_cost_center_ids" SET DEFAULT ARRAY[]::UUID[];
ALTER TABLE "users" ALTER COLUMN "allowed_cost_center_ids" SET NOT NULL;

-- AlterTable: mfa_enrollments
UPDATE "mfa_enrollments" SET "backup_codes_hash" = ARRAY[]::TEXT[] WHERE "backup_codes_hash" IS NULL;
ALTER TABLE "mfa_enrollments" ALTER COLUMN "backup_codes_hash" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "mfa_enrollments" ALTER COLUMN "backup_codes_hash" SET NOT NULL;

-- AlterTable: suppliers
UPDATE "suppliers" SET "cost_types" = ARRAY[]::TEXT[] WHERE "cost_types" IS NULL;
ALTER TABLE "suppliers" ALTER COLUMN "cost_types" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "suppliers" ALTER COLUMN "cost_types" SET NOT NULL;

-- AlterTable: documents
UPDATE "documents" SET "cost_types" = ARRAY[]::TEXT[] WHERE "cost_types" IS NULL;
ALTER TABLE "documents" ALTER COLUMN "cost_types" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "documents" ALTER COLUMN "cost_types" SET NOT NULL;

-- AlterTable: api_keys
UPDATE "api_keys" SET "scopes" = ARRAY[]::TEXT[] WHERE "scopes" IS NULL;
ALTER TABLE "api_keys" ALTER COLUMN "scopes" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "api_keys" ALTER COLUMN "scopes" SET NOT NULL;

-- Indexes for hot paths.

-- Supplier lookup by name during extraction.
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- Outbox claim query ordering by created_at.
DROP INDEX IF EXISTS "outbox_events_processed_at_processing_at_next_attempt_at_idx";
CREATE INDEX "outbox_events_processed_at_processing_at_next_attempt_at_created_at_idx"
  ON "outbox_events"("processed_at", "processing_at", "next_attempt_at", "created_at");

-- Daily digest anomaly lookups by time window + severity.
CREATE INDEX "anomalies_is_backfill_detected_at_severity_idx"
  ON "anomalies"("is_backfill", "detected_at" DESC, "severity");

