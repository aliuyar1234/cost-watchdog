<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-Proprietary-red.svg" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-20+-339933.svg?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Tests-98%20passing-success.svg" alt="Tests">
</p>

<h1 align="center">Cost Watchdog</h1>

<p align="center">
  <strong>Intelligente Kostenüberwachung für den DACH-Mittelstand</strong>
</p>

<p align="center">
  Erkennt Kostenanomalien automatisch, bevor sie teuer werden.<br>
  <em>"Wir sagen dir, wenn etwas nicht stimmt – bevor du 12 Monate zu viel zahlst."</em>
</p>

---

## Das Problem

Ein mittelständisches Unternehmen bemerkt nach 12 Monaten, dass die Stromrechnung um 8,5% gestiegen ist. Kumuliert: **€80.000 Mehrkosten**. Das hätte man in Monat 3 erkennen können.

## Die Lösung

Cost Watchdog analysiert alle eingehenden Rechnungen und Kostendaten automatisch:

- **8 Anomalie-Checks** (YoY, MoM, Preissprünge, statistische Ausreißer, Saisonalität, ...)
- **Sofortige Alerts** via E-Mail, Slack oder Microsoft Teams
- **Dashboard** mit Drill-Down nach Standort, Lieferant, Kostenart
- **PDF-Extraktion** mit Template-Matching und LLM-Fallback

##Dashboard

![Dashboard](docs/Dashboard.png)

---

## Features

| Feature | Beschreibung |
|---------|-------------|
| **Anomaly Detection** | 8 verschiedene Checks mit konfigurierbaren Schwellwerten |
| **Multi-Channel Alerts** | E-Mail, Slack, Microsoft Teams |
| **Document Processing** | PDF, Excel, CSV mit automatischer Datenextraktion |
| **Role-Based Access** | Admin, Manager, Analyst, Viewer, Auditor |
| **API-First** | RESTful API mit API-Key Authentifizierung |
| **Export** | CSV/JSON Export für Compliance und Reporting |

---

## Architektur

![Cost Watchdog Architecture](./docs/watchdog-architecture.png)



## Tech Stack

| Layer | Technologie | Warum |
|-------|-------------|-------|
| **Frontend** | Next.js 14, React 18, Tailwind | Server Components, schnelle Iteration |
| **Backend** | Fastify, TypeScript | Performance, Schema-Validierung |
| **ORM** | Prisma | Type-Safety, Migrations |
| **Database** | PostgreSQL 15 | JSONB, Aggregationen, Zuverlässigkeit |
| **Queue** | Redis + BullMQ | Job Processing, Retry-Logik |
| **Storage** | MinIO (S3-kompatibel) | Dokumente, lokal entwickeln |
| **Monorepo** | Turborepo + pnpm | Schnelle Builds, Workspace-Protokoll |

---

## Projekt-Struktur

```
cost-watchdog/
├── apps/
│   ├── api/                    # Fastify Backend (Port 3001)
│   │   ├── src/
│   │   │   ├── routes/         # REST Endpoints
│   │   │   ├── lib/            # Utilities, Auth, DB
│   │   │   ├── middleware/     # Auth, Rate Limiting
│   │   │   └── workers/        # Background Jobs
│   │   ├── tests/              # Vitest Tests
│   │   └── prisma/             # Schema & Migrations
│   │
│   └── web/                    # Next.js Frontend (Port 3000)
│       └── app/
│           ├── (auth)/         # Login, Register
│           ├── (dashboard)/    # Main Application
│           ├── components/     # UI Components
│           └── lib/            # API Client, Hooks
│
├── packages/
│   ├── core/                   # Business Logic
│   │   └── src/anomaly/        # Anomaly Detection Engine
│   ├── connector-sdk/          # Connector Interface
│   ├── connectors/             # PDF, Excel, CSV
│   └── ui/                     # Shared Components
│
├── docs/                       # Spezifikation
├── infrastructure/             # Docker Compose
└── .github/workflows/          # CI/CD
```

---

## Quick Start

### Voraussetzungen

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Installation

```bash
# Repository klonen
git clone https://github.com/aliuyar1234/cost-watchdog.git
cd cost-watchdog

# Dependencies installieren
pnpm install

# Environment konfigurieren
cp .env.example .env

# Infrastruktur starten
docker-compose -f infrastructure/docker-compose.yml up -d

# Datenbank initialisieren
pnpm db:push

# Development Server starten
pnpm dev
```

Die Anwendung ist erreichbar unter:
- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001
- **API Docs:** http://localhost:3001/documentation

### Erster Admin-User

Der erste registrierte Benutzer wird automatisch zum Admin.

---

## Entwicklung

```bash
# Alle Apps im Dev-Modus
pnpm dev

# Nur API
pnpm --filter @cost-watchdog/api dev

# Nur Web
pnpm --filter @cost-watchdog/web dev

# Type-Check
pnpm typecheck

# Linting
pnpm lint

# Tests ausführen
pnpm test

# Prisma Studio (DB GUI)
pnpm db:studio
```

---

## API

### Authentifizierung

```bash
# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password123"}'

# Mit API-Key
curl http://localhost:3001/anomalies \
  -H "X-API-Key: your-api-key"
```

### Wichtige Endpoints

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| `POST` | `/auth/login` | Benutzer authentifizieren |
| `GET` | `/analytics/dashboard` | Dashboard KPIs |
| `GET` | `/anomalies` | Anomalien auflisten |
| `POST` | `/anomalies/:id/acknowledge` | Anomalie bestätigen |
| `GET` | `/exports/cost-records` | Kostendaten exportieren |
| `POST` | `/documents` | Dokument hochladen |

---

## Anomaly Detection

Cost Watchdog führt 8 verschiedene Anomalie-Checks durch:

| Check | Beschreibung | Schwellwert |
|-------|--------------|-------------|
| **YoY Deviation** | Vergleich zum Vorjahresmonat | ±15% |
| **MoM Deviation** | Vergleich zum Vormonat | ±25% |
| **Price Spike** | Preis pro Einheit | ±20% |
| **Statistical Outlier** | Z-Score Analyse | >2.5σ |
| **Seasonal Anomaly** | Saisonale Abweichung | ±30% |
| **Budget Exceeded** | Budgetüberschreitung | >100% |
| **Duplicate Detection** | Doppelte Rechnungen | Exact Match |
| **Missing Period** | Fehlende Abrechnungsperiode | Gap Detection |

Jede Anomalie erhält einen Schweregrad: `info`, `warning`, oder `critical`.

---

## Deployment

### Docker

```bash
# Production Build
docker build -t cost-watchdog-api -f apps/api/Dockerfile .
docker build -t cost-watchdog-web -f apps/web/Dockerfile .

# Mit Docker Compose
docker-compose -f infrastructure/docker-compose.yml up -d
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/costwatchdog

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# S3/MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=documents

# Optional: LLM für PDF-Extraktion
OPENAI_API_KEY=sk-...
```

---

## Tests

```bash
# Alle Tests
pnpm test

# Mit Coverage
pnpm test -- --coverage

# Einzelne Test-Datei
pnpm --filter @cost-watchdog/api test anomalies.test.ts
```

**Test-Status:** 98 Tests passing (11 Test-Dateien)

---

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [docs/architecture.md](./docs/architecture.md) | Systemarchitektur |
| [docs/data-model.md](./docs/data-model.md) | Datenmodell & Entities |
| [docs/anomaly-engine.md](./docs/anomaly-engine.md) | Anomalie-Checks |
| [docs/api-design.md](./docs/api-design.md) | API Spezifikation |
| [docs/tech-leitplanken.md](./docs/tech-leitplanken.md) | Technische Patterns |

---

## Roadmap

- [ ] Multi-Tenant Support
- [ ] Webhook Integrations
- [ ] Custom Anomaly Rules
- [ ] Machine Learning Predictions
- [ ] Mobile App

---

## Contributing

Dieses Repository ist proprietär. Für Anfragen kontaktieren Sie bitte das Entwicklungsteam.

---

## License

**Proprietary** - Alle Rechte vorbehalten.

---

<p align="center">
  <sub>Built with TypeScript, Fastify, Next.js, and PostgreSQL</sub>
</p>
