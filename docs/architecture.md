# Architecture

This document reflects the current runtime architecture in `main`.

## System overview

Cost Watchdog is a single-tenant deployment model (one installation per customer environment).

Core runtime components:

- `apps/web`: Next.js frontend (dashboard, documents, anomalies, admin settings).
- `apps/api`: Fastify API for auth, ingest, analytics, export, and admin operations.
- `apps/api` workers: asynchronous pipeline processors.
- PostgreSQL: transactional data store (Prisma schema in `apps/api/prisma/schema.prisma`).
- Redis: queue backend, lockout/rate-limit/session primitives, cache support.
- S3-compatible storage (MinIO in local dev): source documents.

## Request and processing flow

### 1. Upload and persist

1. Client uploads through `POST /api/v1/documents/upload`.
2. API validates type/size, stores file in object storage, creates `documents` row.
3. API inserts `outbox_events` row (`document.uploaded`) in the same transaction.

### 2. Outbox dispatch

1. `OutboxPoller` continuously claims unprocessed outbox events.
2. Events are dispatched to BullMQ queues with idempotent job IDs (`outbox_<eventId>`).
3. Processed events are marked complete; failed events are rescheduled with retries.

### 3. Extraction

`extraction` worker behavior by MIME type:

- CSV (`text/csv`): parse and map headers, then persist `cost_records`.
- PDF (`application/pdf`): LLM extraction only, confidence/warning gates enforced.
- If extraction is ambiguous or unsupported, document is moved to `manual` state.

### 4. Anomaly detection

1. New cost records emit `cost_record.created` outbox events.
2. `anomaly-detection` worker loads record context + history.
3. Shared anomaly engine (`packages/core/src/anomaly`) executes enabled checks.
4. Detected anomalies are upserted in `anomalies`.
5. Non-backfill warning/critical anomalies emit `anomaly.detected` events.

### 5. Alerting

1. Outbox creates channel-specific `alerts` based on app settings.
2. `alerts` worker sends email/slack/teams notifications.
3. Delivery state is tracked in `alerts.status`.

### 6. Aggregation and analytics

1. `aggregation` worker updates `cost_record_monthly_agg`.
2. API analytics endpoints read mostly from aggregate tables.
3. This reduces heavy live aggregation against raw `cost_records`.

## Ingest policy

Current policy is intentionally strict:

- Primary ingest path: CSV.
- PDF ingest allowed only when `ANTHROPIC_API_KEY` is configured.
- Unsupported legacy spreadsheet/image types are routed to manual handling, not auto-processed.

## Worker topology

Workers are started from `apps/api/src/workers/index.ts`:

- extraction worker
- anomaly worker
- alert worker
- aggregation worker
- outbox poller
- retention worker (scheduled cleanup)
- daily digest worker

API and workers run as separate processes.

## Reliability patterns

- Transactional outbox between write operations and async processing.
- Queue retry/backoff defaults in `apps/api/src/lib/queues.ts`.
- Idempotent queue job IDs derived from outbox event IDs.
- Fail-closed behavior for critical controls in production (for example `/metrics` token requirement).

## Runtime boundaries

- API handles synchronous validation, auth, access control, and query endpoints.
- Workers handle heavy/slow operations (extraction, anomaly computation, notification delivery).
- Shared domain logic lives in workspace packages (`core`, `connectors`, `connector-sdk`).
