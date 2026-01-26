# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** `packages/connector-sdk/` and below.
- **Owner:** platform
- **Key directories:** `src/`, `dist/`

## Commands

- **Dev:** `pnpm --filter @cost-watchdog/connector-sdk dev`
- **Build:** `pnpm --filter @cost-watchdog/connector-sdk build`
- **Lint:** `pnpm --filter @cost-watchdog/connector-sdk lint`
- **Typecheck:** `pnpm --filter @cost-watchdog/connector-sdk typecheck`

## Conventions

- Keep the SDK minimal; avoid runtime dependencies where possible.
