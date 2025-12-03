import type {
  CostType,
  ConsumptionUnit,
  SupplierCategory,
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  UserRole,
  DocumentType,
  ExtractionStatus,
  VerificationStatus,
  DataQuality,
  ExtractionMethod,
  LocationType,
  OwnershipType,
  AlertChannel,
  AlertStatus,
  AuditAction,
  AuditEntityType,
  SSOProvider,
  PermissionResource,
  PermissionAction,
} from './cost-types.js';

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION & SETTINGS (Single-Tenant)
// ═══════════════════════════════════════════════════════════════════════════

export interface AppSettings {
  defaultCountry: string;
  defaultCurrency: string;
  fiscalYearStart: number;
  alertThresholds: {
    yoyDeviationPercent: number;
    momDeviationPercent: number;
    pricePerUnitDeviationPercent: number;
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

export interface SSOConfig {
  provider: SSOProvider;
  issuer: string;
  certificate?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface Organization {
  id: string;
  name: string;
  legalName?: string;
  registrationNumber?: string;
  taxId?: string;
  industry?: string;
  employeeCount?: number;
  parentOrganizationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// USER & RBAC
// ═══════════════════════════════════════════════════════════════════════════

export interface Permission {
  resource: PermissionResource;
  actions: PermissionAction[];
}

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  ssoSubject?: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  role: UserRole;
  permissions: Permission[];
  allowedLocationIds?: string[];
  allowedCostCenterIds?: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCATION & COST CENTER
// ═══════════════════════════════════════════════════════════════════════════

export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
  region?: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Location {
  id: string;
  organizationId: string;
  name: string;
  code?: string;
  externalId?: string;
  address: Address;
  coordinates?: Coordinates;
  type: LocationType;
  ownershipType: OwnershipType;
  grossFloorArea?: number;
  operationalSince?: Date;
  operationalUntil?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CostCenter {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string;
  annualBudget?: number;
  currency: string;
  parentCostCenterId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT & EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtractionAudit {
  method: ExtractionMethod;
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
}

export interface SourceDocument {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  storagePath: string;
  documentType?: DocumentType;
  costTypes?: CostType[];
  extractionStatus: ExtractionStatus;
  extractedAt?: Date;
  extractionAudit?: ExtractionAudit;
  verificationStatus: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: string;
  verificationNotes?: string;
  uploadedAt: Date;
  uploadedBy: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COST RECORD
// ═══════════════════════════════════════════════════════════════════════════

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceLocation {
  page?: number;
  lineNumber?: number;
  rawText?: string;
  boundingBox?: BoundingBox;
}

export interface CostRecord {
  id: string;
  locationId?: string;
  costCenterId?: string;
  supplierId: string;
  sourceDocumentId?: string;
  invoiceNumber?: string;
  externalId?: string;
  periodStart: Date;
  periodEnd: Date;
  invoiceDate?: Date;
  dueDate?: Date;
  amount: number;
  currency: string;
  amountNet?: number;
  vatAmount?: number;
  vatRate?: number;
  quantity?: number;
  unit?: ConsumptionUnit;
  pricePerUnit?: number;
  costType: CostType;
  costCategory?: string;
  meterNumber?: string;
  contractNumber?: string;
  customerNumber?: string;
  sourceLocation?: SourceLocation;
  confidence: number;
  dataQuality: DataQuality;
  extractionMethod?: ExtractionMethod;
  isVerified: boolean;
  verifiedAt?: Date;
  verifiedBy?: string;
  anomalyStatus: 'ok' | 'warning' | 'critical' | 'acknowledged';
  anomalyAcknowledgedBy?: string;
  anomalyAcknowledgeReason?: string;
  version: number;
  previousVersionId?: string;
  correctionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER
// ═══════════════════════════════════════════════════════════════════════════

export interface SupplierAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface Supplier {
  id: string;
  name: string;
  shortName?: string;
  taxId?: string;
  category: SupplierCategory;
  costTypes: CostType[];
  address?: SupplierAddress;
  website?: string;
  iban?: string;
  templateId?: string;
  totalSpend?: number;
  recordCount?: number;
  avgMonthlySpend?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANOMALY & ALERTING
// ═══════════════════════════════════════════════════════════════════════════

export interface AnomalyDetails {
  expectedValue?: number;
  actualValue?: number;
  deviationPercent?: number;
  deviationAbsolute?: number;
  comparisonPeriod?: string;
  comparisonValue?: number;
  threshold?: number;
  method: string;
}

export interface Anomaly {
  id: string;
  costRecordId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  details: AnomalyDetails;
  statisticalSignificance?: number;
  zScore?: number;
  status: AnomalyStatus;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  acknowledgeReason?: string;
  resolvedAt?: Date;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  id: string;
  anomalyId: string;
  userId?: string;
  channel: AlertChannel;
  recipient: string;
  subject: string;
  body: string;
  status: AlertStatus;
  sentAt?: Date;
  clickedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditLog {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes?: AuditChange[];
  reason?: string;
  metadata?: Record<string, unknown>;
  performedBy: string;
  performedAt: Date;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTBOX EVENT (for event-driven architecture)
// ═══════════════════════════════════════════════════════════════════════════

export interface OutboxEvent {
  id: bigint;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  processedAt?: Date;
  attempts: number;
  nextAttemptAt: Date;
  errorMessage?: string;
}
