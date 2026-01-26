# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** `packages/connectors/` and below.
- **Owner:** platform
- **Key directories:** `src/`, `dist/`

## Commands

- **Dev:** `pnpm --filter @cost-watchdog/connectors dev`
- **Build:** `pnpm --filter @cost-watchdog/connectors build`
- **Lint:** `pnpm --filter @cost-watchdog/connectors lint`
- **Typecheck:** `pnpm --filter @cost-watchdog/connectors typecheck`
- **Test:** `pnpm --filter @cost-watchdog/connectors test`

## Conventions

- Keep connectors deterministic and testable (no network by default).
