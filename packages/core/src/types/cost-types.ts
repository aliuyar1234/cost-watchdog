/**
 * Cost types supported by the system.
 * These represent the different categories of recurring business costs.
 */
export type CostType =
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

/**
 * Consumption units for quantity tracking.
 */
export type ConsumptionUnit =
  | 'kWh'
  | 'MWh'
  | 'm³'
  | 'liter'
  | 'kg'
  | 'tonne'
  | 'piece'
  | 'user'
  | 'GB';

/**
 * Supplier categories for classification.
 */
export type SupplierCategory =
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

/**
 * Anomaly types detected by the anomaly engine.
 */
export type AnomalyType =
  | 'yoy_deviation'
  | 'mom_deviation'
  | 'price_per_unit_spike'
  | 'unusual_amount'
  | 'duplicate_suspected'
  | 'missing_period'
  | 'first_time_supplier'
  | 'contract_mismatch'
  | 'budget_exceeded'
  | 'seasonal_anomaly';

/**
 * Severity levels for anomalies.
 */
export type AnomalySeverity = 'info' | 'warning' | 'critical';

/**
 * Status of an anomaly.
 */
export type AnomalyStatus = 'new' | 'acknowledged' | 'resolved' | 'false_positive';

/**
 * User roles for RBAC.
 */
export type UserRole = 'admin' | 'manager' | 'analyst' | 'viewer' | 'auditor';

/**
 * Document types.
 */
export type DocumentType =
  | 'invoice'
  | 'credit_note'
  | 'statement'
  | 'contract'
  | 'delivery_note'
  | 'other';

/**
 * Document extraction status.
 */
export type ExtractionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'manual';

/**
 * Document verification status.
 */
export type VerificationStatus =
  | 'pending'
  | 'auto_verified'
  | 'manually_verified'
  | 'rejected';

/**
 * Data quality indicator for cost records.
 */
export type DataQuality = 'extracted' | 'manual' | 'imported';

/**
 * Extraction method used for a cost record.
 */
export type ExtractionMethod = 'template' | 'llm' | 'manual' | 'api';

/**
 * Location types.
 */
export type LocationType =
  | 'office'
  | 'warehouse'
  | 'production'
  | 'retail'
  | 'restaurant'
  | 'hotel'
  | 'datacenter'
  | 'other';

/**
 * Ownership types for locations.
 */
export type OwnershipType = 'owned' | 'leased' | 'coworking';

/**
 * Alert channels.
 */
export type AlertChannel = 'email' | 'slack' | 'teams' | 'webhook' | 'in_app';

/**
 * Alert status.
 */
export type AlertStatus = 'pending' | 'sent' | 'failed' | 'clicked';

/**
 * Audit log actions.
 */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'verify'
  | 'acknowledge'
  | 'export'
  | 'login'
  | 'logout';

/**
 * Entity types for audit logging.
 */
export type AuditEntityType =
  | 'organization'
  | 'location'
  | 'cost_center'
  | 'supplier'
  | 'document'
  | 'cost_record'
  | 'anomaly'
  | 'alert'
  | 'user'
  | 'settings';

/**
 * SSO provider types.
 */
export type SSOProvider = 'saml' | 'oidc';

/**
 * Resource types for RBAC permissions.
 */
export type PermissionResource =
  | 'organizations'
  | 'locations'
  | 'documents'
  | 'cost_records'
  | 'reports'
  | 'settings'
  | 'users'
  | 'audit_logs';

/**
 * Permission actions.
 */
export type PermissionAction = 'create' | 'read' | 'update' | 'delete';
