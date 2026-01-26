# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** repo root (`./`) and below.
- **Key directories:**
  - `apps/` (runtime services: `api`, `web`)
  - `packages/` (shared libraries)
  - `infrastructure/` (Docker compose, observability)
  - `scripts/` (repo automation)
  - `docs/` (documentation; do not open unless asked)

## Modules / subprojects

| Module         | Type    | Path                      | What it owns                 | How to run                                               | Tests                                          | Docs                   | AGENTS                             |
| -------------- | ------- | ------------------------- | ---------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ---------------------- | ---------------------------------- |
| api            | fastify | `apps/api/`               | HTTP API, workers, DB access | `pnpm --filter @cost-watchdog/api dev`                   | `pnpm --filter @cost-watchdog/api test`        | `docs/`                | `apps/api/AGENTS.md`               |
| web            | nextjs  | `apps/web/`               | UI, app router, client API   | `pnpm --filter @cost-watchdog/web dev`                   | `pnpm --filter @cost-watchdog/web test:e2e`    | `docs/`                | `apps/web/AGENTS.md`               |
| core           | library | `packages/core/`          | shared types/utilities       | `pnpm --filter @cost-watchdog/core dev`                  | `pnpm --filter @cost-watchdog/core test`       | `docs/`                | `packages/core/AGENTS.md`          |
| connectors     | library | `packages/connectors/`    | document connectors/parsers  | `pnpm --filter @cost-watchdog/connectors dev`            | `pnpm --filter @cost-watchdog/connectors test` | `docs/`                | `packages/connectors/AGENTS.md`    |
| connector-sdk  | library | `packages/connector-sdk/` | connector SDK                | `pnpm --filter @cost-watchdog/connector-sdk dev`         | `-`                                            | `docs/`                | `packages/connector-sdk/AGENTS.md` |
| ui             | library | `packages/ui/`            | shared UI primitives         | `pnpm --filter @cost-watchdog/ui dev`                    | `-`                                            | `docs/`                | `packages/ui/AGENTS.md`            |
| infrastructure | infra   | `infrastructure/`         | compose files, observability | `docker compose -f infrastructure/docker-compose.yml up` | `-`                                            | `infrastructure/docs/` | `infrastructure/AGENTS.md`         |

## Cross-domain workflows

- **Web -> API:** `apps/web` calls the API via `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api/v1`). Auth uses HttpOnly cookies and CSRF (`x-csrf-token`) from `/csrf/token`.
- **Local dev:** start infra (`infrastructure/docker-compose.yml`), then `@cost-watchdog/api` and `@cost-watchdog/web`. E2E uses `scripts/run-e2e-tests.mjs`.

## Verification (preferred commands)

- Default: run quiet first; re-run narrowed failures with verbose logs only when debugging.
- Root quick checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Integration/E2E: `pnpm test:integration`, `pnpm test:e2e`.

## Docs usage

- Do not open/read `docs/` unless the user asks or the task requires it.

## Global conventions

- Use `pnpm` workspaces + `turbo` pipelines.
- Node version: see `.node-version` (>= 20).

## Links to module instructions

- `apps/api/AGENTS.md`
- `apps/web/AGENTS.md`
- `packages/core/AGENTS.md`
- `packages/connectors/AGENTS.md`
- `packages/connector-sdk/AGENTS.md`
- `packages/ui/AGENTS.md`
- `infrastructure/AGENTS.md`
