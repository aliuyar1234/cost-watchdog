# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** `apps/web/` and below.
- **Owner:** frontend
- **Key directories:**
  - `app/` (Next.js App Router)
  - `app/lib/api/` (client API)
  - `app/components/` (UI components, charts)
  - `e2e/` (Playwright tests)

## Commands

- **Install:** `pnpm install` (from repo root)
- **Dev:** `pnpm --filter @cost-watchdog/web dev`
- **Build:** `pnpm --filter @cost-watchdog/web build`
- **Start:** `pnpm --filter @cost-watchdog/web start`
- **Lint:** `pnpm --filter @cost-watchdog/web lint`
- **Typecheck:** `pnpm --filter @cost-watchdog/web typecheck`
- **E2E:** `pnpm --filter @cost-watchdog/web test:e2e`

## Conventions

- App Router uses route groups: `(auth)` and `(dashboard)` under `app/`.
- API calls go through `app/lib/api/*` and use cookie auth + CSRF (`x-csrf-token`).
- Prefer reusable UI in `app/components/ui` and charts in `app/components/charts`.

## Common pitfalls

- `NEXT_PUBLIC_API_URL` must match the API base URL and allow credentials.
- Playwright reads `PLAYWRIGHT_BASE_URL` for base URL overrides.
