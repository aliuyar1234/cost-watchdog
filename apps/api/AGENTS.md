# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** `apps/api/` and below.
- **Owner:** backend
- **Key directories:**
  - `src/` (Fastify app, workers, services)
  - `prisma/` (schema + migrations)
  - `tests/` (Vitest tests)
  - `scripts/` (one-off utilities)

## Commands

- **Install:** `pnpm install` (from repo root)
- **Dev API:** `pnpm --filter @cost-watchdog/api dev`
- **Dev workers:** `pnpm --filter @cost-watchdog/api dev:workers`
- **Build:** `pnpm --filter @cost-watchdog/api build`
- **Start (built):** `pnpm --filter @cost-watchdog/api start`
- **Test:** `pnpm --filter @cost-watchdog/api test`
- **Coverage:** `pnpm --filter @cost-watchdog/api test:coverage`
- **DB:** `pnpm --filter @cost-watchdog/api db:push` | `db:migrate` | `db:studio` | `db:generate`

## Conventions

- Entry point: `src/index.ts`
- Workers entry: `src/workers/index.ts`
- Prisma schema: `prisma/schema.prisma`
- Tests live in `tests/` and `src/**/*.test.ts`

## Common pitfalls

- Tests require a test database name ending with `_test` (see `tests/setup.ts`).
- Local dev needs Postgres/Redis/MinIO from `infrastructure/docker-compose.yml`.
