# Tech Stack

This page captures the technologies currently used in the repository.

## Monorepo and build orchestration

- Package manager: `pnpm` workspaces
- Task orchestration: `turbo`
- Language baseline: TypeScript (Node.js 20+)

## Applications

### API (`apps/api`)

- Runtime: Node.js + Fastify 5
- ORM: Prisma 5
- Queueing: BullMQ 5 + Redis (`ioredis`)
- Object storage SDK: AWS S3 SDK v3
- Validation/parsing: Zod
- Crypto/auth utilities: JOSE, Argon2 (`@node-rs/argon2`), Node crypto
- Metrics: `prom-client` (Prometheus format)

### Web (`apps/web`)

- Framework: Next.js 15 (App Router)
- UI runtime: React 18
- Charts: Recharts
- File upload helper: react-dropzone
- Styling: Tailwind CSS
- E2E testing: Playwright

## Shared packages

### `@cost-watchdog/core`

- Domain types
- Shared anomaly detection engine

### `@cost-watchdog/connectors`

- CSV extraction connector
- PDF pipeline with LLM integration (Anthropic SDK)

### `@cost-watchdog/connector-sdk`

- Connector contracts/types

### `@cost-watchdog/ui`

- Shared UI utility layer for reusable primitives

## Data and infrastructure

- Primary database: PostgreSQL
- Queue/cache/session primitives: Redis
- Document store: S3-compatible bucket (MinIO in local development)

Infrastructure manifests are in `infrastructure/`:

- local compose stack
- production compose variants
- swarm/observability examples

## Testing and quality

- Unit/integration tests: Vitest (API/core/connectors)
- End-to-end tests: Playwright
- Linting: ESLint
- Formatting: Prettier

Root quality commands:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`

## External integrations

- Anthropic API: PDF LLM extraction path
- Resend: email notifications
- Slack and Microsoft Teams incoming webhook delivery

## Runtime configuration

Configuration is environment-driven.

Primary reference: `.env.example`

High-impact toggles include:

- `ANTHROPIC_API_KEY` (PDF extraction capability)
- `METRICS_TOKEN` (metrics endpoint protection)
- `OPENAPI_DOCS_ENABLED` (prod docs exposure)
