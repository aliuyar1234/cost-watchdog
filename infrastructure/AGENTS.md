# Agent instructions (scope: this directory and subdirectories)

## Scope and layout

- **This AGENTS.md applies to:** `infrastructure/` and below.
- **Owner:** platform
- **Key directories:**
  - `docker-compose.yml` (dev)
  - `docker-compose.test.yml` (integration tests)
  - `docker-compose.e2e.yml` (e2e tests)
  - `docker-compose.prod.yml` / `docker-compose.swarm.yml` (prod examples)
  - `observability/` + `docker-compose.observability.yml`

## Commands

- **Dev infra:** `docker compose -f infrastructure/docker-compose.yml up -d`
- **Test infra:** `docker compose -f infrastructure/docker-compose.test.yml up -d`
- **E2E infra:** `docker compose -f infrastructure/docker-compose.e2e.yml up -d`
- **Observability:** `docker compose -f infrastructure/docker-compose.observability.yml up -d`

## Conventions

- Keep compose files aligned with `.env.example` defaults.
- Prefer adding new services here rather than in app-local compose files.
