## Teil 7: Tech Stack & Projektstruktur

### 7.1 Tech Stack

| Komponente | Technologie | Begründung |
|------------|-------------|------------|
| **Frontend** | Next.js 14 (App Router) | SSR, API Routes, Vercel-Deployment |
| **UI Components** | shadcn/ui + Tailwind | Accessible, customizable, modern |
| **Charts** | Recharts | Einfach, React-native |
| **State Management** | TanStack Query | Server-State, Caching, Mutations |
| **Backend** | Node.js + Fastify | Performance, Schema-Validation |
| **ORM** | Prisma | Type-Safety, Migrations, Multi-DB |
| **Database** | PostgreSQL + RLS | ACID, JSON-Support, Row-Level Security |
| **Cache/Queue** | Redis + BullMQ | Events, Job-Queue, Session |
| **Storage** | S3 / MinIO | Dokumente, GDPR-konform |
| **PDF Processing** | pdf.js + pdfplumber | Text-Extraktion |
| **OCR** | Tesseract (nur für Scans) | Open Source, On-Prem möglich |
| **LLM** | Claude API (primary) / OpenAI (fallback) | Strukturierte Extraktion |
| **Auth** | Better-Auth + SSO | Modern, SSO-ready |
| **E-Mail** | Resend | Developer-friendly |
| **Monitoring** | OpenTelemetry + Sentry | Traces, Metrics, Errors |
| **Deployment** | Docker + Railway/Fly | EU-Region, Skalierbar |

### 7.2 Monorepo-Struktur

```
/cost-watchdog
│
├── /apps
│   ├── /web                          # Next.js Frontend
│   │   ├── /app                      # App Router
│   │   │   ├── /(auth)               # Login, SSO
│   │   │   ├── /(dashboard)          # Hauptbereich
│   │   │   │   ├── /overview         # Dashboard
│   │   │   │   ├── /locations        # Standorte
│   │   │   │   ├── /suppliers        # Lieferanten
│   │   │   │   ├── /documents        # Dokumente
│   │   │   │   ├── /costs            # Kostendaten
│   │   │   │   ├── /anomalies        # Anomalien
│   │   │   │   ├── /reports          # Reports & Export
│   │   │   │   └── /settings         # Einstellungen
│   │   │   └── /api                  # API Routes (BFF)
│   │   ├── /components               # UI-Komponenten
│   │   ├── /lib                      # Utilities
│   │   └── /hooks                    # Custom Hooks
│   │
│   └── /api                          # Fastify Backend
│       ├── /src
│       │   ├── /modules              # Feature-Module
│       │   │   ├── /auth
│       │   │   ├── /organizations
│       │   │   ├── /locations
│       │   │   ├── /suppliers
│       │   │   ├── /documents
│       │   │   ├── /costs
│       │   │   ├── /anomalies
│       │   │   ├── /alerts
│       │   │   ├── /analytics
│       │   │   ├── /reports
│       │   │   └── /audit
│       │   ├── /services             # Business Logic
│       │   ├── /plugins              # Fastify Plugins
│       │   └── /utils
│       └── /prisma
│           ├── schema.prisma
│           └── /migrations
│
├── /packages
│   ├── /core                         # Shared Business Logic
│   │   ├── /src
│   │   │   ├── /types                # TypeScript Interfaces
│   │   │   ├── /anomaly              # Anomaly Detection
│   │   │   ├── /validation           # Zod Schemas
│   │   │   └── /utils                # Shared Utilities
│   │   └── package.json
│   │
│   ├── /connector-sdk                # Connector Interface
│   │   ├── /src
│   │   │   ├── types.ts              # Connector Interface
│   │   │   ├── registry.ts           # Connector Registry
│   │   │   └── testing.ts            # Test Utilities
│   │   └── package.json
│   │
│   ├── /connectors                   # Built-in Connectors
│   │   ├── /pdf                      # PDF Invoice Extractor
│   │   │   ├── /templates            # Lieferanten-Templates
│   │   │   ├── /llm                  # LLM-Extraktion
│   │   │   └── /ocr                  # OCR für Scans
│   │   ├── /excel                    # Excel/CSV Import
│   │   ├── /manual                   # Manual Entry Handler
│   │   └── /api                      # Generic API Connector
│   │
│   ├── /esg-module                   # ESG Add-On (V2.0+)
│   │   ├── /src
│   │   │   ├── /calculation          # CO₂-Berechnung
│   │   │   ├── /factors              # Emissionsfaktoren
│   │   │   └── /export               # ESRS E1 Export
│   │   └── package.json
│   │
│   └── /ui                           # Shared UI Components
│       ├── /src
│       │   ├── /components
│       │   └── /hooks
│       └── package.json
│
├── /docs
│   ├── /api                          # API Documentation
│   ├── /guides                       # User Guides
│   └── /architecture                 # Architecture Docs
│
├── /infrastructure
│   ├── /docker
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   └── docker-compose.yml
│   └── /scripts
│       ├── seed.ts
│       └── migrate.ts
│
├── turbo.json                        # Turborepo Config
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

### 7.3 Entwicklungs-Sequence (Vertical Slices)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT SEQUENCE (VERTICAL SLICES)                   │
│                                                                             │
│  SLICE 1: Foundation + Document → Cost (Week 1-4)                          │
│  ═══════════════════════════════════════════════                           │
│  □ Monorepo Setup (Turborepo, pnpm)                                        │
│  □ Prisma Schema (Tenant, Org, Location, Supplier, Document, CostRecord)   │
│  □ RLS Policies auf DB-Ebene                                               │
│  □ Basic Auth (Better-Auth, E-Mail/Passwort)                               │
│  □ Fastify API Skeleton + Tenant-Middleware                                │
│  □ Next.js App Skeleton                                                    │
│  □ PDF Connector (Template-Parser für Top 5 Lieferanten)                   │
│  □ LLM-Fallback für unbekannte Lieferanten (mit Audit-Logging)            │
│  □ Document Upload → Extraction → CostRecord Flow                          │
│  □ Minimal UI: Upload, Review, Bestätigen                                  │
│                                                                             │
│  Deliverable: "PDF hochladen → Kosten extrahiert → gespeichert"           │
│  ───────────────────────────────────────────────────────────────           │
│                                                                             │
│  SLICE 2: Anomaly Detection + Alerting (Week 5-7)                          │
│  ════════════════════════════════════════════════                          │
│  □ Anomaly Engine (YoY, MoM, Price/Unit, Z-Score)                          │
│  □ Anomaly Entity + API                                                    │
│  □ E-Mail Alerting (Resend)                                                │
│  □ Alert UI (Liste, Details, Acknowledge)                                  │
│  □ Settings für Schwellwerte                                               │
│                                                                             │
│  Deliverable: "Anomalie erkannt → E-Mail → Review in UI"                  │
│  ───────────────────────────────────────────────────────────────           │
│                                                                             │
│  SLICE 3: Dashboard + Analytics (Week 8-10)                                │
│  ══════════════════════════════════════════                                │
│  □ Dashboard API (Summary, Trends, Top Anomalies)                          │
│  □ Dashboard UI (KPIs, Charts, Location-Vergleich)                         │
│  □ Kosten nach Typ, Standort, Lieferant                                   │
│  □ Preis/Einheit Tracking                                                  │
│  □ Excel-Export                                                            │
│  □ PDF-Report (Monatlich)                                                  │
│                                                                             │
│  Deliverable: "Dashboard zeigt Überblick + Export funktioniert"           │
│  ───────────────────────────────────────────────────────────────           │
│                                                                             │
│  SLICE 4: Multi-User + RBAC (Week 11-12)                                   │
│  ═══════════════════════════════════════                                   │
│  □ User Entity + API                                                       │
│  □ Role-Based Permissions                                                  │
│  □ User-Verwaltung UI                                                      │
│  □ Audit-Log für User-Aktionen                                             │
│                                                                             │
│  Deliverable: "Mehrere User mit verschiedenen Rollen"                     │
│  ───────────────────────────────────────────────────────────────           │
│                                                                             │
│  SLICE 5: SSO + API Access (Week 13-14)                                    │
│  ══════════════════════════════════════                                    │
│  □ SSO (SAML/OIDC)                                                         │
│  □ API Keys + Rate Limiting                                                │
│  □ Webhooks                                                                │
│  □ API Documentation (OpenAPI)                                             │
│                                                                             │
│  Deliverable: "Enterprise-Auth + externe Integrationen"                   │
│  ───────────────────────────────────────────────────────────────           │
│                                                                             │
│  SLICE 6: Hardening + Launch Prep (Week 15-16)                             │
│  ═════════════════════════════════════════════                             │
│  □ E2E Tests (Playwright)                                                  │
│  □ Unit Tests für Anomaly Engine                                           │
│  □ Security Review                                                         │
│  □ Performance Testing                                                     │
│  □ Monitoring + Alerting (Sentry, OTel)                                    │
│  □ Documentation                                                           │
│  □ Deployment Pipeline (CI/CD)                                             │
│                                                                             │
│  Deliverable: "Production-ready V1.0"                                     │
│  ───────────────────────────────────────────────────────────────           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

