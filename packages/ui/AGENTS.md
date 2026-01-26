# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** `packages/ui/` and below.
- **Owner:** frontend
- **Key directories:** `src/`, `dist/`

## Commands

- **Dev:** `pnpm --filter @cost-watchdog/ui dev`
- **Build:** `pnpm --filter @cost-watchdog/ui build`
- **Lint:** `pnpm --filter @cost-watchdog/ui lint`
- **Typecheck:** `pnpm --filter @cost-watchdog/ui typecheck`

## Conventions

- Keep components framework-agnostic; no app-specific data fetching here.
