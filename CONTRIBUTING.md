# Contributing

Thanks for your interest in contributing to Cost Watchdog.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker + Docker Compose (for integration tests)

### Install

```bash
pnpm install
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d
pnpm db:push
pnpm dev
```

## Quality Gates

Run these before opening a PR:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:integration
```

## Commit Style

- Keep commits small and focused.
- Prefer clear commit messages (Conventional Commits encouraged but not required).

## Security Issues

Please do not open public issues for security vulnerabilities. See `SECURITY.md`.
