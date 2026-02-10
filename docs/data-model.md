# Data Model

This document summarizes the active Prisma schema (`apps/api/prisma/schema.prisma`).

## Design principles

- Single-tenant deployment model per installation.
- UUID primary keys for business entities (except outbox bigint sequence).
- Clear separation between source documents, normalized cost records, anomalies, and alerts.
- Aggregate tables for dashboard/query performance.

## Core domains

### Identity and access

- `users`: account profile, role, permission scopes, restriction lists, MFA flags.
- `api_keys`: hashed machine credentials with scoped permissions and lifecycle fields.
- `mfa_enrollments`: verified MFA methods + hashed backup codes.
- `password_reset_tokens`: one-time reset flow tokens.
- `login_attempts`: lockout support and auth audit context.

### Organization and dimensions

- `organizations`: root org data with parent-child hierarchy support.
- `locations`: location metadata for filtering and analytics.
- `cost_centers`: hierarchical budgeting/accounting unit.
- `suppliers`: supplier master data and derived spend stats.

### Ingest and records

- `documents`: uploaded artifact metadata, extraction state, audit payload.
- `cost_records`: normalized financial facts extracted/imported from documents.

### Detection and notification

- `anomalies`: per-record anomaly detections and lifecycle status.
- `alerts`: channel delivery records tied to anomalies.
- `daily_digests`: scheduled digest jobs and retries.

### Audit and async processing

- `audit_logs`: immutable activity history with request metadata.
- `outbox_events`: transactional event handoff for worker pipelines.

### Performance support tables

- `cost_record_monthly_agg`: pre-aggregated monthly metrics.
- `cost_seasonal_baseline`: seasonal baseline stats.
- `anomaly_suppressions`: scoped suppression rules.
- `app_settings`: singleton app configuration document.

## Important relationships

- `documents` -> `cost_records` (one-to-many)
- `cost_records` -> `anomalies` (one-to-many)
- `anomalies` -> `alerts` (one-to-many)
- `users` referenced from many audit and ownership fields (`uploadedBy`, `acknowledgedBy`, `createdBy`)
- `cost_records` dimension links: `locationId`, `costCenterId`, `supplierId`, `sourceDocumentId`

## Key constraints and indexes

### Business constraints

- Unique document payload hash: `documents.fileHash`
- Duplicate invoice protection: unique `(supplierId, invoiceNumber)` on `cost_records`
- One anomaly per record/type: unique `(costRecordId, type)`
- API keys stored only as hash + prefix (`keyHash`, `keyPrefix`)

### Query-performance indexes

Examples:

- `cost_records`: indexes on period, supplier, location, anomaly status, and composite access patterns.
- `anomalies`: status/severity/detectedAt indexes for alert dashboards.
- `alerts`: status/createdAt indexes for queue and UI views.
- `outbox_events`: polling index on processed/processing/nextAttempt/createdAt.
- `cost_record_monthly_agg`: year + dimension indexes for analytics routes.

## Lifecycle notes

- Soft deletion is used for users (`deletedAt`, `isActive`) and some security flows.
- GDPR delete path anonymizes or removes user-related data where required by policy implementation.
- Outbox events are retried with attempt tracking and next-attempt scheduling.

## Schema ownership

- Source of truth: `apps/api/prisma/schema.prisma`
- Migrations are managed in `apps/api/prisma/migrations`.
