## Teil 3: Systemarchitektur

### 3.1 Architektur-Prinzipien

| Prinzip | Umsetzung |
|---------|-----------|
| **Modularität** | Jede Funktion ist ein eigenständiges Modul mit definierter Schnittstelle |
| **Plugin-Architektur** | Neue Datenquellen = neuer Connector, keine Core-Änderung |
| **Event-Driven** | Asynchrone Verarbeitung über Message Queue |
| **Audit-First** | Jede Datenänderung wird geloggt, bevor sie passiert |
| **Multi-Tenant by Design** | Tenant-Isolation von Tag 1, Row-Level Security auf DB-Ebene |
| **API-First** | Jede Funktion ist über API erreichbar, UI ist nur ein Client |

### 3.2 High-Level Architektur

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │ Web App  │  │ Mobile   │  │ API      │  │ Webhooks │                    │
│  │ (Next.js)│  │ (PWA)    │  │ Clients  │  │ (Zapier) │                    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                    │
│       └─────────────┴─────────────┴─────────────┘                          │
│                              │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                         API GATEWAY                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  • Authentication (JWT + SSO)                                        │   │
│  │  • Rate Limiting                                                     │   │
│  │  • Tenant Resolution                                                 │   │
│  │  • Request Routing                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                        CORE SERVICES                                        │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ ORGANIZATION    │  │ DOCUMENT        │  │ COST RECORD     │             │
│  │ SERVICE         │  │ SERVICE         │  │ SERVICE         │             │
│  │ ───────────     │  │ ───────────     │  │ ───────────     │             │
│  │ • Tenants       │  │ • Upload        │  │ • CRUD          │             │
│  │ • Locations     │  │ • OCR Pipeline  │  │ • Validation    │             │
│  │ • Cost Centers  │  │ • LLM Extract   │  │ • Normalization │             │
│  │ • Users/Roles   │  │ • Verification  │  │ • History       │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│  ┌────────┴────────────────────┴────────────────────┴────────┐             │
│  │                      EVENT BUS (Redis)                     │             │
│  └────────┬────────────────────┬────────────────────┬────────┘             │
│           │                    │                    │                       │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌────────┴────────┐             │
│  │ ANOMALY         │  │ ALERTING        │  │ REPORTING       │             │
│  │ ENGINE          │  │ SERVICE         │  │ SERVICE         │             │
│  │ ───────────     │  │ ───────────     │  │ ───────────     │             │
│  │ • Trend Analysis│  │ • Rule Engine   │  │ • Dashboard     │             │
│  │ • Statistical   │  │ • E-Mail        │  │ • PDF Export    │             │
│  │ • YoY/MoM       │  │ • Slack/Teams   │  │ • Excel Export  │             │
│  │ • Price/Unit    │  │ • Webhooks      │  │ • Scheduled     │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ESG MODULE (Add-On, V2.0+)                        │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │ Emission Calc   │  │ Factor Database │  │ ESRS Export     │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                      CONNECTOR LAYER (Plugin-Architektur)                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     CONNECTOR REGISTRY                               │   │
│  │  Lädt und verwaltet alle Connector-Plugins                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ PDF         │ │ Excel/CSV   │ │ Manual      │ │ API         │  V1.0    │
│  │ Connector   │ │ Connector   │ │ Entry       │ │ Connector   │          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ Smart Meter │ │ DKV Fuel    │ │ E-Mail      │ │ ERP         │  V2.0+   │
│  │ Connector   │ │ Connector   │ │ Inbox       │ │ Connectors  │          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                                             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                         DATA LAYER                                          │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ PostgreSQL      │  │ Redis           │  │ S3 / MinIO      │             │
│  │ ───────────     │  │ ───────────     │  │ ───────────     │             │
│  │ • All Entities  │  │ • Event Bus     │  │ • Documents     │             │
│  │ • Audit Logs    │  │ • Job Queue     │  │ • Exports       │             │
│  │ • RLS Policies  │  │ • Cache         │  │ • Backups       │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  Row-Level Security (RLS):                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CREATE POLICY tenant_isolation ON all_tables                        │   │
│  │  USING (tenant_id = current_setting('app.current_tenant')::uuid)    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Connector-Interface (Plugin-System)

```typescript
// packages/connector-sdk/src/types.ts

/**
 * Basis-Interface das jeder Connector implementieren muss.
 * Ermöglicht Plugin-Architektur ohne Core-Änderungen.
 */
interface Connector {
  /** Eindeutige ID des Connectors */
  id: string;
  
  /** Anzeigename */
  name: string;
  
  /** Connector-Typ */
  type: 'file' | 'api' | 'manual' | 'iot' | 'email';
  
  /** Welche Kostenarten dieser Connector liefern kann */
  supportedCostTypes: CostType[];
  
  /** Version für Kompatibilität */
  version: string;
  
  /** Connector-spezifische Konfiguration */
  configSchema: JSONSchema;
  
  /**
   * Extrahiert Kostendaten aus der Quelle.
   * @returns Standardisierte CostRecord[]
   */
  extract(input: ConnectorInput): Promise<ExtractionResult>;
  
  /**
   * Validiert die Konfiguration.
   */
  validateConfig(config: unknown): ValidationResult;
  
  /**
   * Prüft ob Verbindung zur Quelle funktioniert.
   */
  testConnection(config: unknown): Promise<ConnectionTestResult>;
}

/**
 * Ergebnis einer Extraktion – einheitlich für alle Connectors.
 */
interface ExtractionResult {
  success: boolean;
  records: CostRecord[];
  metadata: {
    sourceType: string;
    extractionTimestamp: Date;
    confidence: number;  // 0-1
    warnings: string[];
    rawData?: unknown;   // Für Debugging
  };
  audit: {
    connectorId: string;
    connectorVersion: string;
    inputHash: string;   // Hash der Eingabedaten
    // LLM-Audit-Felder (ChatGPT-Feedback)
    llmModel?: string;
    llmPromptVersion?: string;
    llmTemperature?: number;
    llmResponseHash?: string;
  };
}

/**
 * Einheitliches Kostenrecord – Output aller Connectors.
 */
interface CostRecord {
  // Identifikation
  externalId?: string;           // ID aus Quellsystem (Rechnungsnummer)
  
  // Zeitraum
  periodStart: Date;
  periodEnd: Date;
  invoiceDate?: Date;
  dueDate?: Date;
  
  // Kosten
  amount: number;
  currency: string;              // ISO 4217
  amountNet?: number;            // Netto (ohne MwSt)
  vatAmount?: number;
  vatRate?: number;
  
  // Verbrauch (wenn relevant)
  quantity?: number;
  unit?: ConsumptionUnit;        // kWh, m³, Liter, Stück
  pricePerUnit?: number;         // €/kWh, €/m³, etc.
  
  // Klassifikation
  costType: CostType;
  costCategory?: string;         // Feinere Kategorisierung
  
  // Quelle
  sourceDocumentId?: string;     // Verknüpfung zum Originaldokument
  sourceLocation?: {             // Wo im Dokument
    page?: number;
    coordinates?: BoundingBox;
    rawText?: string;
  };
  
  // Lieferant
  supplier: {
    name: string;
    supplierId?: string;         // Interne ID
    taxId?: string;              // UID-Nummer
  };
  
  // Zuordnung
  locationId?: string;
  costCenterId?: string;
  contractId?: string;
  
  // Metadaten
  meterNumber?: string;
  contractNumber?: string;
  customerNumber?: string;
  
  // Qualität
  confidence: number;            // 0-1, wie sicher ist die Extraktion
  manuallyVerified: boolean;
  extractionMethod: 'template' | 'llm' | 'manual' | 'api';
}

type CostType =
  | 'electricity'
  | 'natural_gas'
  | 'heating_oil'
  | 'district_heating'
  | 'district_cooling'
  | 'water'
  | 'sewage'
  | 'waste'
  | 'fuel_diesel'
  | 'fuel_petrol'
  | 'fuel_lpg'
  | 'fuel_electric'
  | 'telecom_mobile'
  | 'telecom_landline'
  | 'telecom_internet'
  | 'rent'
  | 'operating_costs'
  | 'maintenance'
  | 'insurance'
  | 'it_licenses'
  | 'it_cloud'
  | 'it_hardware'
  | 'supplier_recurring'
  | 'other';

type ConsumptionUnit = 'kWh' | 'MWh' | 'm³' | 'liter' | 'kg' | 'tonne' | 'piece' | 'user' | 'GB';
```

### 3.4 PDF-Extraktion Pipeline (ChatGPT-Feedback eingearbeitet)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PDF EXTRACTION PIPELINE                               │
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │  PDF Upload     │                                                       │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 1: PDF TYPE DETECTION                                          │   │
│  │  ──────────────────────────                                          │   │
│  │                                                                       │   │
│  │  Prüfe: Hat PDF eingebetteten Text?                                  │   │
│  │                                                                       │   │
│  │  ├─ JA (Digitales PDF) ────────────────────┐                         │   │
│  │  │   • 90% aller DACH-Energierechnungen    │                         │   │
│  │  │   • Direkte Text-Extraktion möglich     │                         │   │
│  │  │                                         │                         │   │
│  │  └─ NEIN (Scan/Bild-PDF) ──────────────┐   │                         │   │
│  │      • Alte Belege, Lieferscheine      │   │                         │   │
│  │      • OCR notwendig                   │   │                         │   │
│  │                                        │   │                         │   │
│  └────────────────────────────────────────┴───┴─────────────────────────┘   │
│           │                                   │                              │
│           ▼                                   ▼                              │
│  ┌─────────────────────┐           ┌─────────────────────┐                  │
│  │  Digital Text Path  │           │  Scanned Image Path │                  │
│  │  ─────────────────  │           │  ────────────────── │                  │
│  │  pdf.js / pdfplumber│           │  Tesseract / Paddle │                  │
│  │  → Strukturierter   │           │  → OCR Text         │                  │
│  │    Text + Layout    │           │  → Lower Confidence │                  │
│  └──────────┬──────────┘           └──────────┬──────────┘                  │
│             │                                  │                             │
│             └──────────────┬───────────────────┘                             │
│                            │                                                 │
│                            ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 2: SUPPLIER DETECTION                                          │   │
│  │  ──────────────────────────                                          │   │
│  │                                                                       │   │
│  │  Erkenne Lieferanten aus:                                            │   │
│  │  • Logo (wenn Bild)                                                  │   │
│  │  • Header-Text (Wien Energie, E.ON, Vodafone, etc.)                  │   │
│  │  • UID-Nummer                                                        │   │
│  │  • IBAN                                                              │   │
│  │                                                                       │   │
│  │  ├─ BEKANNTER LIEFERANT ──────────────────┐                          │   │
│  │  │   Template-basierte Extraktion         │                          │   │
│  │  │   (Regex + Positionen)                 │                          │   │
│  │  │   → 95%+ Genauigkeit                   │                          │   │
│  │  │   → Schnell, deterministisch           │                          │   │
│  │  │                                        │                          │   │
│  │  └─ UNBEKANNTER LIEFERANT ────────────┐   │                          │   │
│  │      LLM-basierte Extraktion          │   │                          │   │
│  │      → 85-95% Genauigkeit             │   │                          │   │
│  │      → Langsamer, teurer              │   │                          │   │
│  │                                       │   │                          │   │
│  └───────────────────────────────────────┴───┴──────────────────────────┘   │
│           │                                   │                              │
│           ▼                                   ▼                              │
│  ┌─────────────────────┐           ┌─────────────────────┐                  │
│  │  Template Parser    │           │  LLM Extractor      │                  │
│  │  ────────────────   │           │  ──────────────     │                  │
│  │  • Regex-Patterns   │           │  • Claude/GPT-4     │                  │
│  │  • Position-based   │           │  • Structured Output│                  │
│  │  • Deterministic    │           │  • Audit-Logging    │                  │
│  │  • No API Cost      │           │  • Retry-Logic      │                  │
│  └──────────┬──────────┘           └──────────┬──────────┘                  │
│             │                                  │                             │
│             └──────────────┬───────────────────┘                             │
│                            │                                                 │
│                            ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 3: VALIDATION & NORMALIZATION                                  │   │
│  │  ────────────────────────────────                                    │   │
│  │                                                                       │   │
│  │  • Pflichtfelder vorhanden?                                          │   │
│  │  • Beträge plausibel? (nicht negativ, nicht absurd hoch)            │   │
│  │  • Datum valide?                                                     │   │
│  │  • Einheiten normalisiert?                                           │   │
│  │  • Preis/Einheit berechnet                                           │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                            │                                                 │
│                            ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 4: AUDIT LOGGING (ChatGPT-Feedback)                            │   │
│  │  ────────────────────────────────────────                            │   │
│  │                                                                       │   │
│  │  ExtractionAudit {                                                   │   │
│  │    documentId: "doc_xyz",                                            │   │
│  │    extractionMethod: "llm",  // oder "template"                      │   │
│  │    templateId?: "wien_energie_v2",                                   │   │
│  │    llmModel?: "claude-3-5-sonnet",                                   │   │
│  │    llmPromptVersion?: "cost_extraction_v1.3",                        │   │
│  │    llmTemperature?: 0.0,                                             │   │
│  │    llmInputHash: "sha256:abc123...",                                 │   │
│  │    llmOutputHash: "sha256:def456...",                                │   │
│  │    llmRawResponse: { ... },  // Für Debugging                        │   │
│  │    confidence: 0.94,                                                 │   │
│  │    extractedFields: ["amount", "period", "supplier", "quantity"],    │   │
│  │    missingFields: [],                                                │   │
│  │    warnings: [],                                                     │   │
│  │    timestamp: "2026-03-15T10:23:45Z"                                 │   │
│  │  }                                                                   │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                            │                                                 │
│                            ▼                                                 │
│  ┌─────────────────┐                                                       │
│  │  CostRecord     │                                                       │
│  │  (normalisiert) │                                                       │
│  └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Template-Parser für Top-Lieferanten (V1)

```typescript
// packages/connectors/pdf/src/templates/index.ts

/**
 * Template-Registry für bekannte Lieferanten.
 * Deckt ~80% der DACH-Energierechnungen ab.
 */
export const supplierTemplates: SupplierTemplate[] = [
  // Strom - Österreich
  { id: 'wien_energie', patterns: ['Wien Energie', 'ATU16346809'], parser: wienEnergieParser },
  { id: 'evn', patterns: ['EVN Energievertrieb', 'ATU15766402'], parser: evnParser },
  { id: 'verbund', patterns: ['VERBUND', 'ATU14703908'], parser: verbundParser },
  { id: 'energie_steiermark', patterns: ['Energie Steiermark', 'ATU37009307'], parser: energieSteiermarkParser },
  { id: 'kelag', patterns: ['KELAG', 'ATU26aboratory404'], parser: kelagParser },
  
  // Strom - Deutschland  
  { id: 'eon', patterns: ['E.ON Energie', 'DE811182998'], parser: eonParser },
  { id: 'enbw', patterns: ['EnBW', 'DE812276032'], parser: enbwParser },
  { id: 'rwe', patterns: ['RWE', 'DE811184594'], parser: rweParser },
  { id: 'vattenfall', patterns: ['Vattenfall', 'DE118702827'], parser: vattenfallParser },
  { id: 'stadtwerke_muenchen', patterns: ['Stadtwerke München', 'DE129521671'], parser: swmParser },
  
  // Gas/Fernwärme
  { id: 'wien_energie_gas', patterns: ['Wien Energie', 'Erdgas'], parser: wienEnergieGasParser },
  { id: 'tigas', patterns: ['TIGAS', 'ATU36782606'], parser: tigasParser },
  
  // Telekom - Österreich
  { id: 'a1', patterns: ['A1 Telekom', 'ATU62895905'], parser: a1Parser },
  { id: 'magenta', patterns: ['Magenta Telekom', 'ATU62159929'], parser: magentaParser },
  { id: 'drei', patterns: ['Drei Austria', 'ATU61347377'], parser: dreiParser },
  
  // Telekom - Deutschland
  { id: 'telekom', patterns: ['Deutsche Telekom', 'DE123475223'], parser: telekomParser },
  { id: 'vodafone', patterns: ['Vodafone', 'DE812381591'], parser: vodafoneParser },
  { id: 'o2', patterns: ['Telefónica Germany', 'DE813127040'], parser: o2Parser },
];

interface SupplierTemplate {
  id: string;
  patterns: string[];  // Erkennungsmuster (Text oder UID)
  parser: (text: string, layout: PDFLayout) => CostRecord;
}
```

---

