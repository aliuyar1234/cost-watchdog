## Teil 4: Datenmodell

### 4.1 Entity-Relationship-Diagramm

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE DATA MODEL                                   │
│                                                                             │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   TENANT     │────────▶│ ORGANIZATION │────────▶│   LOCATION   │        │
│  │              │ 1    n  │              │ 1    n  │              │        │
│  │ • id         │         │ • id         │         │ • id         │        │
│  │ • name       │         │ • tenantId   │         │ • orgId      │        │
│  │ • settings   │         │ • name       │         │ • name       │        │
│  │ • plan       │         │ • industry   │         │ • address    │        │
│  │ • ssoConfig  │         │ • parentId   │         │ • country    │        │
│  └──────────────┘         └──────────────┘         │ • area_m2    │        │
│         │                                          └──────┬───────┘        │
│         │                                                 │                 │
│         ▼                                                 │                 │
│  ┌──────────────┐                                        │                 │
│  │    USER      │                                        │                 │
│  │ ──────────── │                                        │                 │
│  │ • id         │                                        │                 │
│  │ • tenantId   │                                        │                 │
│  │ • email      │                                        │                 │
│  │ • role       │                                        │                 │
│  │ • permissions│                                        │                 │
│  └──────────────┘                                        │                 │
│                                                          │ 1               │
│                                                          ▼ n               │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   DOCUMENT   │────────▶│  COST_RECORD │◀────────│ COST_CENTER  │        │
│  │              │ 1    n  │              │ n    1  │              │        │
│  │ • id         │         │ • id         │         │ • id         │        │
│  │ • tenantId   │         │ • locationId │         │ • name       │        │
│  │ • filename   │         │ • documentId │         │ • code       │        │
│  │ • fileHash   │         │ • periodStart│         │ • budget     │        │
│  │ • status     │         │ • amount     │         └──────────────┘        │
│  │ • extraction │         │ • quantity   │                                  │
│  │   Audit      │         │ • pricePerUnit│                                 │
│  └──────────────┘         │ • costType   │                                  │
│                           │ • supplier   │                                  │
│                           │ • confidence │                                  │
│                           └──────┬───────┘                                  │
│                                  │                                          │
│                                  │ 1                                        │
│                                  ▼ n                                        │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   SUPPLIER   │         │   ANOMALY    │         │    ALERT     │        │
│  │              │         │              │         │              │        │
│  │ • id         │         │ • id         │         │ • id         │        │
│  │ • name       │         │ • costRecordId│        │ • anomalyId  │        │
│  │ • taxId      │         │ • type       │         │ • channel    │        │
│  │ • category   │         │ • severity   │         │ • sentAt     │        │
│  │ • contracts  │         │ • expected   │         │ • status     │        │
│  └──────────────┘         │ • actual     │         └──────────────┘        │
│                           │ • deviation% │                                  │
│                           └──────────────┘                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         AUDIT_LOG                                     │  │
│  │  • id • entityType • entityId • action • before • after • userId     │  │
│  │  • timestamp • metadata (immutable, append-only)                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Vollständige TypeScript-Interfaces

```typescript
// packages/core/src/types/entities.ts

// ═══════════════════════════════════════════════════════════════════════════
// TENANT & ORGANIZATION
// ═══════════════════════════════════════════════════════════════════════════

interface Tenant {
  id: string;                    // UUID
  name: string;
  slug: string;                  // URL-friendly identifier
  plan: 'starter' | 'professional' | 'business' | 'enterprise';
  settings: TenantSettings;
  ssoConfig?: SSOConfig;
  createdAt: Date;
  updatedAt: Date;
}

interface TenantSettings {
  defaultCountry: string;        // ISO 3166-1 alpha-2
  defaultCurrency: string;       // ISO 4217
  fiscalYearStart: number;       // 1-12
  alertThresholds: {
    yoyDeviationPercent: number;    // Default: 20
    momDeviationPercent: number;    // Default: 30
    pricePerUnitDeviationPercent: number; // Default: 10
  };
  features: {
    esgModule: boolean;
    forecastModule: boolean;
    apiAccess: boolean;
  };
  notifications: {
    emailAlerts: boolean;
    slackWebhook?: string;
    teamsWebhook?: string;
  };
}

interface SSOConfig {
  provider: 'saml' | 'oidc';
  issuer: string;
  certificate?: string;
  clientId?: string;
  clientSecret?: string;
}

interface Organization {
  id: string;
  tenantId: string;
  
  // Stammdaten
  name: string;
  legalName?: string;
  registrationNumber?: string;   // Firmenbuchnummer
  taxId?: string;                // UID-Nummer
  
  // Klassifikation
  industry?: string;             // NACE-Code
  employeeCount?: number;
  
  // Konzernstruktur
  parentOrganizationId?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// USER & RBAC (ChatGPT-Feedback: war nicht spezifiziert)
// ═══════════════════════════════════════════════════════════════════════════

interface User {
  id: string;
  tenantId: string;
  
  // Auth
  email: string;
  passwordHash?: string;         // Null bei SSO
  ssoSubject?: string;           // SSO User ID
  
  // Profil
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  
  // Rollen & Rechte
  role: UserRole;
  permissions: Permission[];
  
  // Einschränkungen (optional)
  allowedLocationIds?: string[]; // Nur bestimmte Standorte sehen
  allowedCostCenterIds?: string[];
  
  // Status
  isActive: boolean;
  lastLoginAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

type UserRole = 
  | 'admin'           // Alles
  | 'manager'         // Lesen, Schreiben, keine User-Verwaltung
  | 'analyst'         // Lesen, Reports
  | 'viewer'          // Nur Lesen
  | 'auditor';        // Lesen + Audit-Logs, keine Änderungen

interface Permission {
  resource: 'organizations' | 'locations' | 'documents' | 'cost_records' | 'reports' | 'settings' | 'users' | 'audit_logs';
  actions: ('create' | 'read' | 'update' | 'delete')[];
}

const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    { resource: 'organizations', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'locations', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'documents', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'cost_records', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'reports', actions: ['create', 'read'] },
    { resource: 'settings', actions: ['read', 'update'] },
    { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'audit_logs', actions: ['read'] },
  ],
  manager: [
    { resource: 'organizations', actions: ['read', 'update'] },
    { resource: 'locations', actions: ['create', 'read', 'update'] },
    { resource: 'documents', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'cost_records', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'reports', actions: ['create', 'read'] },
    { resource: 'settings', actions: ['read'] },
    { resource: 'users', actions: ['read'] },
    { resource: 'audit_logs', actions: ['read'] },
  ],
  analyst: [
    { resource: 'organizations', actions: ['read'] },
    { resource: 'locations', actions: ['read'] },
    { resource: 'documents', actions: ['read'] },
    { resource: 'cost_records', actions: ['read'] },
    { resource: 'reports', actions: ['create', 'read'] },
    { resource: 'audit_logs', actions: ['read'] },
  ],
  viewer: [
    { resource: 'organizations', actions: ['read'] },
    { resource: 'locations', actions: ['read'] },
    { resource: 'documents', actions: ['read'] },
    { resource: 'cost_records', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
  ],
  auditor: [
    { resource: 'organizations', actions: ['read'] },
    { resource: 'locations', actions: ['read'] },
    { resource: 'documents', actions: ['read'] },
    { resource: 'cost_records', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
    { resource: 'audit_logs', actions: ['read'] },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// LOCATION & COST CENTER
// ═══════════════════════════════════════════════════════════════════════════

interface Location {
  id: string;
  tenantId: string;
  organizationId: string;
  
  // Identifikation
  name: string;
  code?: string;                 // Interne Kurzbezeichnung (z.B. "WIEN-01")
  externalId?: string;           // ID aus ERP/Facility-System
  
  // Adresse
  address: {
    street: string;
    city: string;
    postalCode: string;
    country: string;             // ISO 3166-1 alpha-2
    region?: string;             // Bundesland
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  
  // Klassifikation
  type: 'office' | 'warehouse' | 'production' | 'retail' | 'restaurant' | 'hotel' | 'datacenter' | 'other';
  ownershipType: 'owned' | 'leased' | 'coworking';
  
  // Fläche (für Normalisierung)
  grossFloorArea?: number;       // m²
  
  // Betrieb
  operationalSince?: Date;
  operationalUntil?: Date;
  isActive: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

interface CostCenter {
  id: string;
  tenantId: string;
  organizationId: string;
  
  name: string;
  code: string;                  // z.B. "4200" für Energie
  description?: string;
  
  // Budget (optional)
  annualBudget?: number;
  currency: string;
  
  // Hierarchie
  parentCostCenterId?: string;
  
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT & EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

interface SourceDocument {
  id: string;
  tenantId: string;
  
  // Datei
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;              // Bytes
  fileHash: string;              // SHA-256
  storagePath: string;           // S3 Key
  
  // Klassifikation
  documentType?: 'invoice' | 'credit_note' | 'statement' | 'contract' | 'delivery_note' | 'other';
  costTypes?: CostType[];        // Welche Kostenarten im Dokument
  
  // Extraktion
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'manual';
  extractedAt?: Date;
  
  // Extraktions-Audit (ChatGPT-Feedback)
  extractionAudit?: {
    method: 'template' | 'llm' | 'manual';
    templateId?: string;
    templateVersion?: string;
    llmModel?: string;
    llmPromptVersion?: string;
    llmTemperature?: number;
    llmInputHash?: string;
    llmOutputHash?: string;
    llmRawResponse?: Record<string, unknown>;
    confidence: number;
    extractedFields: string[];
    missingFields: string[];
    warnings: string[];
  };
  
  // Verifizierung
  verificationStatus: 'pending' | 'auto_verified' | 'manually_verified' | 'rejected';
  verifiedAt?: Date;
  verifiedBy?: string;           // User ID
  verificationNotes?: string;
  
  // Upload-Info
  uploadedAt: Date;
  uploadedBy: string;            // User ID
}

// ═══════════════════════════════════════════════════════════════════════════
// COST RECORD (Kernentität)
// ═══════════════════════════════════════════════════════════════════════════

interface CostRecord {
  id: string;
  tenantId: string;
  
  // Zuordnung
  locationId?: string;
  costCenterId?: string;
  supplierId: string;
  sourceDocumentId?: string;     // Verknüpfung zum Beleg
  
  // Identifikation
  invoiceNumber?: string;
  externalId?: string;
  
  // Zeitraum
  periodStart: Date;
  periodEnd: Date;
  invoiceDate?: Date;
  dueDate?: Date;
  
  // Kosten
  amount: number;                // Bruttobetrag
  currency: string;              // ISO 4217
  amountNet?: number;
  vatAmount?: number;
  vatRate?: number;
  
  // Verbrauch (wenn relevant)
  quantity?: number;
  unit?: ConsumptionUnit;
  pricePerUnit?: number;         // Berechnet: amount / quantity
  
  // Klassifikation
  costType: CostType;
  costCategory?: string;         // Feinere Kategorisierung
  
  // Metadaten
  meterNumber?: string;
  contractNumber?: string;
  customerNumber?: string;
  
  // Quellenangabe im Dokument
  sourceLocation?: {
    page?: number;
    lineNumber?: number;
    rawText?: string;
    boundingBox?: BoundingBox;
  };
  
  // Qualität
  confidence: number;            // 0-1
  dataQuality: 'extracted' | 'manual' | 'imported';
  extractionMethod?: 'template' | 'llm' | 'manual' | 'api';
  
  // Verifizierung
  isVerified: boolean;
  verifiedAt?: Date;
  verifiedBy?: string;
  
  // Anomalie-Status
  anomalyStatus: 'ok' | 'warning' | 'critical' | 'acknowledged';
  anomalyAcknowledgedBy?: string;
  anomalyAcknowledgeReason?: string;
  
  // Versionierung
  version: number;
  previousVersionId?: string;
  correctionReason?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER
// ═══════════════════════════════════════════════════════════════════════════

interface Supplier {
  id: string;
  tenantId: string;
  
  // Identifikation
  name: string;
  shortName?: string;
  taxId?: string;                // UID-Nummer
  
  // Kategorisierung
  category: SupplierCategory;
  costTypes: CostType[];         // Welche Kostenarten dieser Lieferant liefert
  
  // Kontakt
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  website?: string;
  
  // Bankverbindung (für Matching)
  iban?: string;
  
  // Template-Zuordnung
  templateId?: string;           // Für Extraktion
  
  // Statistik (berechnet)
  totalSpend?: number;           // Gesamtausgaben
  recordCount?: number;          // Anzahl Belege
  avgMonthlySpend?: number;
  
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type SupplierCategory = 
  | 'energy_electricity'
  | 'energy_gas'
  | 'energy_heating'
  | 'energy_fuel'
  | 'water'
  | 'waste'
  | 'telecom'
  | 'it_services'
  | 'facility'
  | 'other';

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY & ALERTING
// ═══════════════════════════════════════════════════════════════════════════

interface Anomaly {
  id: string;
  tenantId: string;
  costRecordId: string;
  
  // Klassifikation
  type: AnomalyType;
  severity: 'info' | 'warning' | 'critical';
  
  // Details
  message: string;
  details: {
    expectedValue?: number;
    actualValue?: number;
    deviationPercent?: number;
    deviationAbsolute?: number;
    comparisonPeriod?: string;
    comparisonValue?: number;
    threshold?: number;
    method: string;              // z.B. "yoy_comparison", "zscore"
  };
  
  // Statistik
  statisticalSignificance?: number;  // p-value
  zScore?: number;
  
  // Status
  status: 'new' | 'acknowledged' | 'resolved' | 'false_positive';
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  acknowledgeReason?: string;
  resolvedAt?: Date;
  
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type AnomalyType =
  | 'yoy_deviation'          // Jahr-über-Jahr Abweichung
  | 'mom_deviation'          // Monat-über-Monat Abweichung
  | 'price_per_unit_spike'   // Preis/Einheit gestiegen
  | 'unusual_amount'         // Statistisch ungewöhnlicher Betrag
  | 'duplicate_suspected'    // Mögliches Duplikat
  | 'missing_period'         // Fehlende Periode
  | 'first_time_supplier'    // Neuer Lieferant
  | 'contract_mismatch'      // Weicht von Vertragskonditionen ab
  | 'budget_exceeded'        // Budget überschritten
  | 'seasonal_anomaly';      // Ungewöhnlich für Saison

interface Alert {
  id: string;
  tenantId: string;
  anomalyId: string;
  
  // Empfänger
  userId?: string;
  channel: 'email' | 'slack' | 'teams' | 'webhook' | 'in_app';
  recipient: string;             // E-Mail oder Webhook-URL
  
  // Inhalt
  subject: string;
  body: string;
  
  // Status
  status: 'pending' | 'sent' | 'failed' | 'clicked';
  sentAt?: Date;
  clickedAt?: Date;
  errorMessage?: string;
  
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG (immutable)
// ═══════════════════════════════════════════════════════════════════════════

interface AuditLog {
  id: string;
  tenantId: string;
  
  // Was wurde geändert
  entityType: 'organization' | 'location' | 'cost_center' | 'supplier' | 'document' | 'cost_record' | 'anomaly' | 'alert' | 'user' | 'settings';
  entityId: string;
  
  // Art der Änderung
  action: 'create' | 'update' | 'delete' | 'verify' | 'acknowledge' | 'export' | 'login' | 'logout';
  
  // Änderungsdetails
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes?: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  
  // Kontext
  reason?: string;
  metadata?: Record<string, unknown>;
  
  // Wer/Wann
  performedBy: string;           // User ID oder 'system'
  performedAt: Date;
  
  // Technischer Kontext
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}
```

---

