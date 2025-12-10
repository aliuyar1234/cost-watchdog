#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Cost Watchdog - Database Restore Script
# ═══════════════════════════════════════════════════════════════════════════
#
# Restores a PostgreSQL backup from S3 with checksum verification.
#
# Usage:
#   ./restore.sh <backup_filename>
#   ./restore.sh cost_watchdog_20250101_120000.dump
#   ./restore.sh latest  # Restores the most recent backup
#
# Required environment variables:
#   DATABASE_URL   - PostgreSQL connection string
#   S3_BUCKET      - S3 bucket name for backups
#   S3_REGION      - AWS region (default: eu-central-1)
#   S3_PREFIX      - S3 key prefix (default: backups/)
#
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ───────────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────────

RESTORE_DIR="${RESTORE_DIR:-/tmp/restore}"
S3_REGION="${S3_REGION:-eu-central-1}"
S3_PREFIX="${S3_PREFIX:-backups/}"

# ───────────────────────────────────────────────────────────────────────────
# Helper Functions
# ───────────────────────────────────────────────────────────────────────────

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

cleanup() {
  log "Cleaning up temporary files..."
  rm -rf "${RESTORE_DIR}" 2>/dev/null || true
}

trap cleanup EXIT

# ───────────────────────────────────────────────────────────────────────────
# Validation
# ───────────────────────────────────────────────────────────────────────────

if [[ -z "${DATABASE_URL:-}" ]]; then
  error "DATABASE_URL is not set"
  exit 1
fi

if [[ -z "${S3_BUCKET:-}" ]]; then
  error "S3_BUCKET is not set"
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_filename|latest>"
  echo ""
  echo "Available backups:"
  aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --region "${S3_REGION}" | grep "\.dump$" | awk '{print $4}'
  exit 1
fi

BACKUP_FILE="$1"

# ───────────────────────────────────────────────────────────────────────────
# Find Latest Backup
# ───────────────────────────────────────────────────────────────────────────

if [[ "${BACKUP_FILE}" == "latest" ]]; then
  log "Finding latest backup..."
  BACKUP_FILE=$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --region "${S3_REGION}" \
    | grep "\.dump$" \
    | sort -k1,2 -r \
    | head -1 \
    | awk '{print $4}')

  if [[ -z "${BACKUP_FILE}" ]]; then
    error "No backups found in s3://${S3_BUCKET}/${S3_PREFIX}"
    exit 1
  fi

  log "Latest backup: ${BACKUP_FILE}"
fi

# ───────────────────────────────────────────────────────────────────────────
# Confirmation
# ───────────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                        ⚠️  WARNING ⚠️                                  ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  This will REPLACE ALL DATA in the database with the backup.        ║"
echo "║  This action cannot be undone.                                       ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Backup file: ${BACKUP_FILE}"
echo ""

read -p "Are you sure you want to proceed? Type 'RESTORE' to confirm: " confirm
if [[ "${confirm}" != "RESTORE" ]]; then
  log "Restore cancelled"
  exit 0
fi

# ───────────────────────────────────────────────────────────────────────────
# Download Backup
# ───────────────────────────────────────────────────────────────────────────

mkdir -p "${RESTORE_DIR}"
RESTORE_PATH="${RESTORE_DIR}/${BACKUP_FILE}"

log "Downloading backup from S3..."
if ! aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}${BACKUP_FILE}" "${RESTORE_PATH}" \
  --region "${S3_REGION}"; then
  error "Failed to download backup"
  exit 1
fi

log "Downloading checksum..."
if ! aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}${BACKUP_FILE}.sha256" "${RESTORE_PATH}.sha256" \
  --region "${S3_REGION}"; then
  error "Failed to download checksum"
  exit 1
fi

# ───────────────────────────────────────────────────────────────────────────
# Verify Checksum
# ───────────────────────────────────────────────────────────────────────────

log "Verifying checksum..."

EXPECTED_CHECKSUM=$(cat "${RESTORE_PATH}.sha256" | cut -d' ' -f1)
ACTUAL_CHECKSUM=$(sha256sum "${RESTORE_PATH}" | cut -d' ' -f1)

if [[ "${EXPECTED_CHECKSUM}" != "${ACTUAL_CHECKSUM}" ]]; then
  error "Checksum verification FAILED!"
  error "Expected: ${EXPECTED_CHECKSUM}"
  error "Actual:   ${ACTUAL_CHECKSUM}"
  error "The backup file may be corrupted. Restore aborted."
  exit 1
fi

log "Checksum verified: ${ACTUAL_CHECKSUM}"

# ───────────────────────────────────────────────────────────────────────────
# Restore Database
# ───────────────────────────────────────────────────────────────────────────

log "Restoring database..."
log "This may take several minutes depending on the backup size..."

if ! pg_restore \
  --dbname="${DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --single-transaction \
  "${RESTORE_PATH}"; then
  error "pg_restore failed"
  exit 1
fi

# ───────────────────────────────────────────────────────────────────────────
# Success
# ───────────────────────────────────────────────────────────────────────────

log "╔══════════════════════════════════════════════════════════════════════╗"
log "║                     ✅ RESTORE COMPLETE ✅                            ║"
log "╚══════════════════════════════════════════════════════════════════════╝"
log ""
log "Backup restored: ${BACKUP_FILE}"
log ""
log "⚠️  IMPORTANT: Restart the application to ensure all caches are cleared."

exit 0
