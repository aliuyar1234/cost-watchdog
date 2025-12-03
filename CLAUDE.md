# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cost Watchdog is a cost monitoring platform for DACH-region mid-market businesses. It detects cost anomalies before they become expensive problems (e.g., catching an 8.5% utility bill increase in month 3 instead of discovering an €80k overpayment after 12 months).

**Architecture:** Single-Tenant (one deployment = one customer)

**Stack:** Next.js 14 (App Router), Fastify, Prisma, PostgreSQL, Redis + BullMQ, S3/MinIO

## Commands

```bash
# Install dependencies
pnpm install

# Start development (all apps)
pnpm dev

# Build all packages
pnpm build

# Lint and type check
pnpm lint
pnpm typecheck

# Run tests
pnpm test

# Database operations (from root)
pnpm db:push      # Push schema to database
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Prisma Studio

# Start infrastructure
docker-compose up -d postgres redis minio
```

## Architecture

### Monorepo Structure

```
/apps
  /web                    # Next.js 14 frontend (port 3000)
    /app/lib/api/         # API client modules (auth, documents, anomalies, etc.)
  /api                    # Fastify backend (port 3001)
    /src/lib/validators.ts  # Shared validation utilities (isValidUUID, parseQueryInt)
    /src/lib/errors.ts      # Error response helpers (sendNotFound, sendBadRequest)
/packages
  /core             # Business logic, shared types (CostType, ConsumptionUnit, etc.)
  /connector-sdk    # Connector interface definition
  /connectors       # PDF, Excel, CSV connectors
  /ui               # Shared UI components (shadcn/ui)
```

### Key Patterns

**Single-Tenant Architecture:** Each deployment serves one customer. No tenant_id or RLS policies needed. Database access uses Prisma directly.

```typescript
// Direct Prisma access - no tenant wrapper needed
const records = await prisma.costRecord.findMany({
  where: { costType: 'electricity' }
});
```

**Outbox Pattern for Events:** Business operations and events MUST be in the same transaction. Never publish directly to Redis.

```typescript
// CORRECT
await prisma.$transaction(async (tx) => {
  const record = await tx.costRecord.create({ data });
  await tx.outboxEvent.create({
    data: { eventType: 'cost_record.created', payload: { id: record.id } }
  });
});
```

**Idempotency:** All async operations must be idempotent. Use unique constraints on target tables and BullMQ job IDs derived from event IDs.

```typescript
await queue.add('process', payload, { jobId: `outbox_${event.id}` });
```

**Connector Contract:** Connectors only extract data - no side effects. The Ingestion Service handles validation, deduplication, storage, and events.

```typescript
interface Connector {
  extract(input: ConnectorInput): Promise<ExtractionResult>;
}
```

### Data Flow

1. User uploads PDF → Document stored in S3
2. `document.uploaded` event written to outbox table
3. Worker polls outbox, queues extraction job
4. PDF Connector extracts data (template-based for known suppliers, LLM fallback)
5. CostRecords created with `cost_record.created` events
6. Anomaly Engine processes new records

## Critical Rules

1. **TypeScript Strict:** `strict: true`, no `any` types. Run `pnpm turbo typecheck` before committing.
2. **Events via Outbox:** Never bypass the outbox pattern for event publishing
3. **Aggregates for Analytics:** Dashboard reads from pre-computed `cost_record_monthly_agg`, never aggregates raw CostRecords
4. **Backfill Mode:** Historical imports calculate anomalies but suppress alerts
5. **First User is Admin:** The first registered user automatically becomes admin
6. **Shared Utilities:** Use `apps/api/src/lib/validators.ts` for UUID validation and query parsing. Use `apps/api/src/lib/errors.ts` for error responses.
7. **API Client Modules:** Frontend API calls go through `apps/web/app/lib/api/` domain modules (auth.ts, documents.ts, etc.)

## Documentation

| File | Content |
|------|---------|
| `docs/architecture.md` | System architecture, connector interface |
| `docs/data-model.md` | All entities, TypeScript interfaces |
| `docs/anomaly-engine.md` | 8 anomaly checks, severity logic, seasonality |
| `docs/api-design.md` | REST endpoints, response formats |
| `docs/tech-leitplanken.md` | Outbox, Idempotency patterns |
| `docs/slices/slice-*.md` | Implementation roadmap by phase |

## Current Progress

### Completed Features

**Infrastructure:**
- Docker-compose setup (PostgreSQL, Redis, MinIO)
- Fastify API with Prisma
- Next.js 14 frontend with Tailwind
- All TypeScript types/interfaces in packages/core

**Authentication & Authorization:**
- JWT-based authentication
- Role-based access control (admin, manager, analyst, viewer, auditor)
- First user becomes admin automatically

**Document Processing:**
- Document upload to S3/MinIO
- Extraction pipeline with workers
- Support for PDF, Excel (.xlsx), and CSV documents

**Anomaly Detection:**
- 8 anomaly checks (YoY, MoM, price spike, statistical outlier, etc.)
- Configurable thresholds
- Alert generation and delivery

**Dashboard & Analytics:**
- Cost trends visualization
- Breakdown by cost type, location, supplier
- Year-over-year comparison
- Export functionality (CSV, JSON)

**User Management:**
- User CRUD operations
- Password reset
- Location/cost center restrictions

**API Features:**
- Rate limiting
- API key authentication for external access
- Comprehensive error handling
- OpenAPI/Swagger documentation

**Code Quality:**
- Full TypeScript strict mode compliance (`pnpm turbo typecheck` passes)
- Shared validation utilities to avoid duplication
- Modular API client structure (domain-based modules)
- Consistent error handling patterns
