# Cost Watchdog

Intelligente Kostenüberwachungsplattform für den DACH-Mittelstand.

> "Wir sagen dir wenn etwas nicht stimmt, bevor du 12 Monate zu viel zahlst."

## Quick Start

```bash
# Dependencies installieren
pnpm install

# Environment kopieren
cp .env.example .env

# Database starten (Docker)
docker-compose up -d postgres redis minio

# Database migrieren
pnpm db:push

# Development Server starten
pnpm dev
```

## Struktur

```
/cost-watchdog
├── /apps
│   ├── /web          # Next.js Frontend (Port 3000)
│   └── /api          # Fastify Backend (Port 3001)
├── /packages
│   ├── /core         # Shared Types, Business Logic
│   ├── /connector-sdk # Connector Interface
│   ├── /connectors   # PDF, Excel, Manual Connectors
│   └── /ui           # Shared UI Components
├── /docs             # Spezifikation
└── /infrastructure   # Docker, Scripts
```

## Dokumentation

- [CLAUDE.md](./CLAUDE.md) - Projekt-Übersicht für AI Assistants
- [docs/architecture.md](./docs/architecture.md) - Systemarchitektur
- [docs/data-model.md](./docs/data-model.md) - Datenmodell
- [docs/tech-leitplanken.md](./docs/tech-leitplanken.md) - Kritische technische Patterns

## Development

```bash
# Lint
pnpm lint

# Type Check
pnpm typecheck

# Tests
pnpm test

# Prisma Studio
pnpm db:studio
```

## Tech Stack

| Layer | Technologie |
|-------|-------------|
| Frontend | Next.js 14, shadcn/ui, Tailwind |
| Backend | Fastify, Prisma |
| Database | PostgreSQL + RLS |
| Queue | Redis + BullMQ |
| Storage | S3/MinIO |

## License

Proprietary
