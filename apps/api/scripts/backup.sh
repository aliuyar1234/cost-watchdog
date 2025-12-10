#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Cost Watchdog - Database Backup Script
# ═══════════════════════════════════════════════════════════════════════════
#
# Creates a timestamped PostgreSQL backup, computes checksum, and uploads to S3.
# Designed to run as a cron job in production.
#
# Required environment variables:
#   DATABASE_URL   - PostgreSQL connection string
#   S3_BUCKET      - S3 bucket name for backups
#   S3_REGION      - AWS region (default: eu-central-1)
#   S3_PREFIX      - S3 key prefix (default: backups/)
#
# Optional:
#   BACKUP_RETENTION_DAYS - Days to keep backups (default: 30)
#   SLACK_WEBHOOK_URL     - Webhook for notifications
#   TEAMS_WEBHOOK_URL     - Webhook for notifications
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ───────────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────────

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
BACKUP_FILE="cost_watchdog_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

S3_REGION="${S3_REGION:-eu-central-1}"
S3_PREFIX="${S3_PREFIX:-backups/}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# ───────────────────────────────────────────────────────────────────────────
# Helper Functions
# ───────────────────────────────────────────────────────────────────────────

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

notify_success() {
  local message="✅ *Cost Watchdog Backup Successful*\n\n📦 File: \`${BACKUP_FILE}\`\n📊 Size: ${BACKUP_SIZE}\n🔑 Checksum: \`${CHECKSUM}\`\n🗓️ Timestamp: ${TIMESTAMP}"

  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
      -H 'Content-Type: application/json' \
      -d "{\"text\": \"${message}\"}" || true
  fi

  if [[ -n "${TEAMS_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "${TEAMS_WEBHOOK_URL}" \
      -H 'Content-Type: application/json' \
      -d "{\"text\": \"${message}\"}" || true
  fi
}

notify_failure() {
  local message="❌ *Cost Watchdog Backup FAILED*\n\n🚨 Error: $1\n🗓️ Timestamp: ${TIMESTAMP}"

  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
      -H 'Content-Type: application/json' \
      -d "{\"text\": \"${message}\"}" || true
  fi

  if [[ -n "${TEAMS_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "${TEAMS_WEBHOOK_URL}" \
      -H 'Content-Type: application/json' \
      -d "{\"text\": \"${message}\"}" || true
  fi
}

cleanup() {
  log "Cleaning up temporary files..."
  rm -f "${BACKUP_PATH}" "${BACKUP_PATH}.sha256" 2>/dev/null || true
}

trap cleanup EXIT

# ───────────────────────────────────────────────────────────────────────────
# Validation
# ───────────────────────────────────────────────────────────────────────────

if [[ -z "${DATABASE_URL:-}" ]]; then
  error "DATABASE_URL is not set"
  notify_failure "DATABASE_URL is not set"
  exit 1
fi

if [[ -z "${S3_BUCKET:-}" ]]; then
  error "S3_BUCKET is not set"
  notify_failure "S3_BUCKET is not set"
  exit 1
fi

# ───────────────────────────────────────────────────────────────────────────
# Main Backup Process
# ───────────────────────────────────────────────────────────────────────────

log "Starting backup process..."

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Create PostgreSQL dump
log "Creating database dump..."
if ! pg_dump "${DATABASE_URL}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="${BACKUP_PATH}"; then
  error "pg_dump failed"
  notify_failure "pg_dump command failed"
  exit 1
fi

# Calculate checksum
log "Calculating checksum..."
CHECKSUM=$(sha256sum "${BACKUP_PATH}" | cut -d' ' -f1)
echo "${CHECKSUM}  ${BACKUP_FILE}" > "${BACKUP_PATH}.sha256"

# Get file size
BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)

log "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"
log "Checksum: ${CHECKSUM}"

# Upload to S3
log "Uploading to S3..."
if ! aws s3 cp "${BACKUP_PATH}" "s3://${S3_BUCKET}/${S3_PREFIX}${BACKUP_FILE}" \
  --region "${S3_REGION}" \
  --storage-class STANDARD_IA; then
  error "S3 upload failed"
  notify_failure "S3 upload failed"
  exit 1
fi

# Upload checksum file
if ! aws s3 cp "${BACKUP_PATH}.sha256" "s3://${S3_BUCKET}/${S3_PREFIX}${BACKUP_FILE}.sha256" \
  --region "${S3_REGION}" \
  --storage-class STANDARD_IA; then
  error "S3 checksum upload failed"
  notify_failure "S3 checksum upload failed"
  exit 1
fi

log "Upload complete"

# ───────────────────────────────────────────────────────────────────────────
# Retention Cleanup
# ───────────────────────────────────────────────────────────────────────────

log "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."

CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --region "${S3_REGION}" | while read -r line; do
  file=$(echo "$line" | awk '{print $4}')
  if [[ -z "$file" ]]; then continue; fi

  # Extract date from filename (cost_watchdog_YYYYMMDD_HHMMSS.dump)
  file_date=$(echo "$file" | grep -oP '\d{8}' | head -1 || echo "")

  if [[ -n "$file_date" && "$file_date" < "$CUTOFF_DATE" ]]; then
    log "Deleting old backup: $file"
    aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}${file}" --region "${S3_REGION}" || true
  fi
done

# ───────────────────────────────────────────────────────────────────────────
# Success
# ───────────────────────────────────────────────────────────────────────────

log "Backup completed successfully!"
notify_success

exit 0
