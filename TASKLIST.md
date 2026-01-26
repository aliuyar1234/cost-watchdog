# Cost Watchdog - Audit Task List (updated 2026-01-26)

Goal: bring the repo to **>= 8/10** quality for a public GitHub release (reliable, secure, maintainable).

Legend: **P0** = broken/blocking/security, **P1** = high impact, **P2** = nice-to-have.

## 1) Infrastructure & Deployment

- [x] (P1) Fix MinIO healthcheck: `minio/minio` doesn’t ship with curl/wget; use `mc ready` (and fall back to the `/minio/health/ready` endpoint if tooling exists). `infrastructure/docker-compose.yml`
- [x] (P1) Avoid `docker compose` dev/test/e2e collisions by setting explicit compose project names. `infrastructure/docker-compose.yml`, `infrastructure/docker-compose.test.yml`, `infrastructure/docker-compose.e2e.yml`
- [x] (P1) Pin `minio/mc` to a digest (tags don’t map 1:1) and harden MinIO init for reliable bucket creation. `infrastructure/docker-compose.yml`, `infrastructure/docker-compose.e2e.yml`
- [x] (P1) Fix Redis config for queues: BullMQ expects `maxmemory-policy noeviction` (current dev compose uses `allkeys-lru`, which can drop jobs). `infrastructure/docker-compose.yml`
- [x] (P1) Ensure the S3/MinIO bucket exists in local dev (auto-create on startup for MinIO, or add a small init container / script). `infrastructure/docker-compose.yml`, `apps/api/src/lib/s3.ts`
- [x] (P1) Use Docker secrets for provider API keys in production compose (Anthropic/Resend) instead of env vars. `infrastructure/docker-compose.prod.yml`, `infrastructure/docker-compose.swarm.yml`
- [x] (P1) Align backup/restore docs vs reality (backup service is referenced but not present in prod compose). Either add a scheduled backup container or update docs to require host cron/K8s CronJob. `infrastructure/docker-compose.prod.yml`, `apps/api/scripts/backup.sh`, `docs/*` (and/or add `infrastructure/docs` to repo if intended public)
- [x] (P2) Add an example "observability stack" compose (Prometheus + Grafana + log shipping) and document how to use `/metrics`. `infrastructure/*`

## 2) CI/CD & Repo Tooling

- [x] (P0) Add a real ESLint configuration (root + per-package overrides) so `pnpm lint` works. Right now ESLint fails because no config exists. `apps/api/package.json`, `apps/web/package.json`, `packages/*/package.json`
- [x] (P1) Add Prettier (or equivalent) + `.editorconfig` and wire `format` + `format:check` scripts for consistent diffs. (No formatting config exists currently.)
- [x] (P1) Fix Turbo pipeline: `lint`, `typecheck`, and `test` shouldn't depend on `^build` by default (slows feedback and can hide failures). `turbo.json`
- [x] (P1) Add a Node version pin (`.nvmrc` or `.node-version`) to match CI (`node >= 20`). `package.json`
- [x] (P2) Remove emojis from repo output/logging/docs (requested).
- [x] (P2) Add `lint-staged` + `husky` (optional) to prevent pushing broken lint/typecheck.

## 3) Type Safety & Build Correctness

- [x] (P0) Fix API TypeScript build blockers:
  - `records` inference issue in aggregation worker. `apps/api/src/workers/aggregation.worker.ts`
  - `emailRecipients[0]` possibly undefined (noUncheckedIndexedAccess). `apps/api/src/workers/outbox-poller.ts`
- [x] (P0) Fix Web TypeScript build blocker: `HeadersInit` indexing for CSRF header injection. `apps/web/app/lib/api/client.ts`
- [x] (P1) Add `pnpm typecheck` to CI as a separate job that must pass (right now it would fail).

## 4) Security (Auth, Sessions, CSRF, Headers)

- [x] (P0) Ensure refresh tokens cannot be used as access tokens (tag access tokens and reject `type=refresh` / missing claims during `verifyToken`). `apps/api/src/lib/auth.ts`, `apps/api/src/middleware/auth.ts`
- [x] (P0) Fix refresh-token family logic: token families currently store the hash of a token that the client never receives, which will cause rotation to fail / look like token theft. Rework flow to:
  - create `familyId` first
  - mint refresh token with `fid=familyId`
  - store hash of _that_ refresh token as family "current"
  - rotate on refresh. `apps/api/src/services/auth.service.ts`, `apps/api/src/lib/token-rotation.ts`, `apps/api/src/lib/auth.ts`
- [x] (P0) Enforce session/JTI blacklist during JWT auth (session termination currently won't invalidate tokens because the middleware only checks token-hash blacklist). Use `request.user.jti` + `isSessionBlacklisted`. `apps/api/src/middleware/auth.ts`, `apps/api/src/lib/sessions.ts`
- [x] (P0) Enforce user-level blacklist for lockout/password reset (currently written but not checked). Use `request.user.iat` + `isUserBlacklisted`. `apps/api/src/middleware/auth.ts`, `apps/api/src/lib/account-lockout.ts`
- [x] (P0) Fix CSRF secret loading in production: middleware reads `process.env.AUTH_SECRET` but production config uses Docker secrets (`/run/secrets/auth_secret`). Use `secrets.getRequiredAuthSecret()` or pass secret explicitly. `apps/api/src/middleware/csrf.ts`, `apps/api/src/lib/secrets.ts`
- [x] (P1) Apply stricter per-route rate limits to auth endpoints (login/refresh/register/forgot/reset). Global default limit is too permissive for brute force. `apps/api/src/routes/auth.ts`, `apps/api/src/lib/rate-limit.ts`, `apps/api/src/index.ts`
- [x] (P1) Stop trusting raw `x-forwarded-for` unless proxy trust is enabled (IP spoofing risk). Use Fastify's `request.ip` derived from `trustProxy`. `apps/api/src/middleware/request-context.ts`, `apps/api/src/lib/rate-limit.ts`
- [x] (P1) Escape/sanitize dynamic HTML fields in emails (supplier/location/message) to avoid HTML injection. `apps/api/src/lib/email.ts`
- [x] (P2) Gate `/metrics` behind `METRICS_TOKEN` (optional bearer auth) if it's ever exposed outside a private network. `apps/api/src/routes/metrics.ts`

## 5) Database & Prisma (Schema, Migrations, Data Integrity)

- [x] (P0) Fix broken alert foreign keys: `anomaly.detected` outbox event uses the wrong identifier, so alert creation will fail (anomalyId vs costRecordId mismatch). See also workers/outbox handler. `apps/api/src/workers/anomaly.worker.ts`, `apps/api/src/workers/outbox-poller.ts`, `apps/api/prisma/schema.prisma`
- [x] (P1) Add/verify DB defaults for scalar-list columns (UUID[] / TEXT[]) so Prisma's non-null `String[]` fields don't end up `NULL` at runtime. `apps/api/prisma/migrations/20260125190000_defaults_and_indexes/migration.sql`, `apps/api/prisma/schema.prisma`
- [x] (P1) Add indexes that match hot queries:
  - outbox claim query: include ordering (`created_at`) in an index that matches the filter. `apps/api/prisma/schema.prisma`
  - supplier lookup by name/taxId (avoid scans). `apps/api/prisma/schema.prisma`
  - anomalies daily digest query (`detectedAt`, `severity`) if needed. `apps/api/prisma/schema.prisma`
- [x] (P1) Wire the Prisma encryption middleware so sensitive fields are encrypted at rest (contract/customer/meter numbers). `apps/api/src/lib/prisma-encryption-middleware.ts`, `apps/api/src/lib/db.ts`

## 6) Backend Design & Correctness (API, RBAC, Services)

- [x] (P0) Fix access-control bug for restricted users: documents with `NULL` `locationId` / `costCenterId` can incorrectly match restrictions and leak access. Treat missing IDs as "no match" when restrictions exist. `apps/api/src/lib/document-access.ts`
- [x] (P1) Refactor `getAccessibleDocuments` to avoid loading huge ID lists into memory (use a single SQL query with `OR` / joins, or a view/materialized view). `apps/api/src/lib/document-access.ts`
- [x] (P1) Reconcile docs vs behavior for initial admin:
  - README says first user becomes admin
  - code makes first user admin only when `INITIAL_ADMIN_EMAIL` matches. `README.md`, `apps/api/src/services/auth.service.ts`, `.env.example`
- [x] (P2) Remove unused `@fastify/jwt` dependency (not used; `jose` is used for JWT). `apps/api/package.json`
- [x] (P2) Remove other unused imports/dependencies and dead code. `packages/*`, `apps/*`

## 7) Workers, Outbox Pattern, and Queues

- [x] (P0) Fix outbox -> alerts chain identifiers (emit real `anomaly.id` and consume `payload.anomalyId`). `apps/api/src/workers/anomaly.worker.ts`, `apps/api/src/workers/outbox-poller.ts`
- [x] (P0) Ensure extracted cost records carry `locationId`/`costCenterId` so anomaly detection is not skipped. `apps/api/src/workers/extraction.worker.ts`
- [x] (P0) Add regression tests for outbox -> alerts chain. `apps/api/tests/*`
- [x] (P1) Add a full pipeline integration test (document.uploaded -> extraction -> anomaly.detected -> alert sent). `apps/api/tests/pipeline.integration.test.ts`
- [x] (P1) Add bounded concurrency to outbox processing (currently sequential; can backlog under load). `apps/api/src/workers/outbox-poller.ts`
- [x] (P1) Aggregation worker: use `upsert` instead of `findFirst + update/create` (race + extra query). `apps/api/src/workers/aggregation.worker.ts`
- [x] (P1) Aggregation worker: add server-side aggregation (`GROUP BY`) option for full rebuild to reduce memory pressure. `apps/api/src/workers/aggregation.worker.ts`
- [x] (P1) Fix `getQueueStats` to support all queues (alerts/aggregation missing). `apps/api/src/lib/queues.ts`
- [x] (P2) Optimize session listing by using pipelining/mget instead of sequential `await` per session. `apps/api/src/lib/sessions.ts`
- [x] (P2) Handle BullMQ/Redis `error` events to avoid noisy unhandled-error logs. `apps/api/src/lib/queues.ts`, `apps/api/src/lib/redis.ts`

## 8) Frontend (UX, A11y, Performance, API Integration)

- [x] (P0) Fix `fetchApi`/`fetchApiForm` header typing (build blocker). `apps/web/app/lib/api/client.ts`
- [x] (P1) Add user-visible error states (banners/toasts) plus retry actions (no silent `console.error`). `apps/web/app/(dashboard)/*`
- [x] (P1) Reduce over-fetching and add request deduping (in-flight GET) for dashboard/anomalies/documents. `apps/web/app/(dashboard)/*`, `apps/web/app/lib/api/client.ts`
- [x] (P1) Add proper pagination/infinite scroll for documents (avoid `limit: 100`/`1000` patterns). `apps/web/app/(dashboard)/documents/page.tsx`, `apps/web/app/lib/api/documents.ts`
- [x] (P1) Improve accessibility:
  - aria labels for icon-only actions
  - accessible dialogs instead of `confirm()`/`prompt()` flows. `apps/web/app/components/ui/modal.tsx`, `apps/web/app/(dashboard)/*`
- [x] (P2) Add chart summaries for screen readers. `apps/web/app/components/charts/*`
- [x] (P2) Decide ownership of shared UI: remove unused `@cost-watchdog/ui` dependency from web until it's actually used. `apps/web/package.json`, `apps/web/next.config.js`

## 9) Testing & QA (prove features actually work)

- [x] (P0) Prevent tests from truncating a non-test database (guard `DATABASE_URL` + require `*_test` DB name). `apps/api/tests/setup.ts`
- [x] (P0) Make "local tests" runnable with one command (compose + env + migrations):
  - add a `docker-compose.test.yml` (Postgres + Redis) and a script (`pnpm test:integration`) that brings infra up/down. `infrastructure/*`, `apps/api/tests/setup.ts`
- [x] (P0) Add regression tests for the currently broken chains:
  - refresh token rotation happy-path + theft detection path. `apps/api/tests/*`
  - session termination invalidates tokens (JTI + user blacklist enforced). `apps/api/tests/*`
  - outbox anomaly event produces alerts and sends/marks status. `apps/api/tests/*`
  - CSRF in "docker secrets mode" (AUTH_SECRET not in env). `apps/api/tests/*`
- [x] (P1) Add web smoke/e2e tests (Playwright) for login -> upload doc -> see anomalies -> acknowledge -> settings. `apps/web/*`
- [x] (P2) Add contract tests between web client and API (OpenAPI snapshot or typed client generation). `apps/api/src/lib/openapi.ts`, `apps/web/app/lib/api/*`

## 10) Performance & Scalability

- [x] (P1) Review and add composite indexes for common analytics queries (location/supplier/costType/period). `apps/api/prisma/schema.prisma`
- [x] (P1) Add request-level caching where safe (e.g., app settings, alert settings, notification settings) and avoid repeated DB reads per request. `apps/api/src/lib/*`
- [x] (P2) Add load-test scripts (k6/artillery) for: list anomalies, dashboard KPIs, upload + extraction queueing. `infrastructure/*` or `scripts/*`

## 11) Documentation & Open-Source Readiness

- [x] (P0) Decide licensing: README currently says "Proprietary", which conflicts with "publish so people can use it". Add a real `LICENSE` and adjust README badges/copy accordingly. `README.md`, `LICENSE`
- [x] (P1) Add contributor docs: `CONTRIBUTING.md`, a root `SECURITY.md` (GitHub picks it up), and issue templates. `.github/*`
- [x] (P1) Update docs to match real setup requirements (bucket init, initial admin behavior, how workers are started). `README.md`, `.env.example`

## 12) Feature Verification Checklist (after P0/P1 fixes)

- [x] Register -> login -> refresh -> logout -> session list/terminate works reliably (no false "token theft"). (integration tests: `apps/api/tests/auth.integration.test.ts`, `apps/api/tests/sessions.test.ts`)
- [x] Upload PDF -> S3 write succeeds -> outbox enqueues extraction -> cost records created -> outbox enqueues anomaly detection -> anomalies persisted -> outbox enqueues alert -> alert delivered/marked sent. (integration: `apps/api/tests/pipeline.integration.test.ts`, e2e: `apps/web/e2e/smoke.spec.js`)
- [x] RBAC: restricted user cannot access documents/cost records without matching location/cost center (including when IDs are NULL). (integration tests: `apps/api/tests/documents.test.ts`)
- [x] Daily digest respects per-user settings and does not duplicate sends; retries behave correctly. (worker tests: `apps/api/tests/daily-digest.worker.test.ts`)
- [x] Data retention runs safely and does not delete required data prematurely; audit logs remain consistent. (integration tests: `apps/api/tests/data-retention.test.ts`)

## 13) Next Session / Optional Follow-ups

- [ ] (P2) Add more Playwright coverage: upload multiple file types (PDF/CSV/XLSX), pagination, admin user management.
- [ ] (P2) Add load-testing (k6/artillery) for high-traffic endpoints and upload/extraction throughput.
