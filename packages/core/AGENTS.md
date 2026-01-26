# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** `packages/core/` and below.
- **Owner:** platform
- **Key directories:** `src/`, `dist/`

## Commands

- **Dev:** `pnpm --filter @cost-watchdog/core dev`
- **Build:** `pnpm --filter @cost-watchdog/core build`
- **Lint:** `pnpm --filter @cost-watchdog/core lint`
- **Typecheck:** `pnpm --filter @cost-watchdog/core typecheck`
- **Test:** `pnpm --filter @cost-watchdog/core test`

## Conventions

- Pure TS library; keep APIs stable and typed.
