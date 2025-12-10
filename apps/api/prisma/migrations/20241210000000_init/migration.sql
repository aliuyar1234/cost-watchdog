-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "registration_number" TEXT,
    "tax_id" TEXT,
    "industry" TEXT,
    "employee_count" INTEGER,
    "parent_organization_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'Cost Watchdog',
    "plan" TEXT NOT NULL DEFAULT 'professional',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "sso_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "sso_subject" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "allowed_location_ids" UUID[],
    "allowed_cost_center_ids" UUID[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_required" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'totp',
    "secret_encrypted" TEXT NOT NULL,
    "backup_codes_hash" TEXT[],
    "backup_codes_used" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "external_id" TEXT,
    "address" JSONB NOT NULL,
    "coordinates" JSONB,
    "type" TEXT NOT NULL DEFAULT 'office',
    "ownership_type" TEXT NOT NULL DEFAULT 'leased',
    "gross_floor_area" DECIMAL(12,2),
    "operational_since" TIMESTAMP(3),
    "operational_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "annual_budget" DECIMAL(18,4),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "parent_cost_center_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "tax_id" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "cost_types" TEXT[],
    "address" JSONB,
    "website" TEXT,
    "iban" TEXT,
    "template_id" TEXT,
    "total_spend" DECIMAL(18,4),
    "record_count" INTEGER,
    "avg_monthly_spend" DECIMAL(18,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "document_type" TEXT,
    "cost_types" TEXT[],
    "extraction_status" TEXT NOT NULL DEFAULT 'pending',
    "extracted_at" TIMESTAMP(3),
    "extraction_audit" JSONB,
    "verification_status" TEXT NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "verification_notes" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_records" (
    "id" UUID NOT NULL,
    "location_id" UUID,
    "cost_center_id" UUID,
    "supplier_id" UUID NOT NULL,
    "source_document_id" UUID,
    "invoice_number" TEXT,
    "external_id" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "invoice_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amount_net" DECIMAL(18,4),
    "vat_amount" DECIMAL(18,4),
    "vat_rate" DECIMAL(5,2),
    "quantity" DECIMAL(18,4),
    "unit" TEXT,
    "price_per_unit" DECIMAL(18,6),
    "cost_type" TEXT NOT NULL,
    "cost_category" TEXT,
    "meter_number" TEXT,
    "contract_number" TEXT,
    "customer_number" TEXT,
    "source_location" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "data_quality" TEXT NOT NULL DEFAULT 'extracted',
    "extraction_method" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "anomaly_status" TEXT NOT NULL DEFAULT 'ok',
    "anomaly_acknowledged_by" UUID,
    "anomaly_acknowledge_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "correction_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" UUID NOT NULL,
    "cost_record_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "statistical_significance" DOUBLE PRECISION,
    "z_score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'new',
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" UUID,
    "acknowledge_reason" TEXT,
    "resolved_at" TIMESTAMP(3),
    "is_backfill" BOOLEAN NOT NULL DEFAULT false,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "anomaly_id" UUID NOT NULL,
    "user_id" UUID,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changes" JSONB,
    "reason" TEXT,
    "metadata" JSONB,
    "performed_by" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "anonymized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL,
    "failure_reason" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_message" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_record_monthly_agg" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "location_id" UUID,
    "supplier_id" UUID,
    "cost_type" TEXT,
    "amount_sum" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "amount_net_sum" DECIMAL(18,4),
    "quantity_sum" DECIMAL(18,4),
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_record_monthly_agg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_seasonal_baseline" (
    "id" UUID NOT NULL,
    "location_id" UUID,
    "supplier_id" UUID,
    "cost_type" TEXT NOT NULL,
    "month_of_year" INTEGER NOT NULL,
    "avg_amount" DECIMAL(18,4) NOT NULL,
    "std_dev" DECIMAL(18,4),
    "median_amount" DECIMAL(18,4),
    "sample_count" INTEGER NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_seasonal_baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_suppressions" (
    "id" UUID NOT NULL,
    "anomaly_type" TEXT NOT NULL,
    "location_id" UUID,
    "supplier_id" UUID,
    "cost_type" TEXT,
    "min_deviation_percent" DECIMAL(5,2),
    "max_deviation_percent" DECIMAL(5,2),
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "anomaly_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_by_id" UUID NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_enrollments_user_id_method_key" ON "mfa_enrollments"("user_id", "method");

-- CreateIndex
CREATE INDEX "locations_organization_id_idx" ON "locations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE INDEX "cost_centers_organization_id_idx" ON "cost_centers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tax_id_key" ON "suppliers"("tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_file_hash_key" ON "documents"("file_hash");

-- CreateIndex
CREATE INDEX "documents_extraction_status_idx" ON "documents"("extraction_status");

-- CreateIndex
CREATE INDEX "documents_uploaded_at_idx" ON "documents"("uploaded_at" DESC);

-- CreateIndex
CREATE INDEX "documents_extraction_status_uploaded_at_idx" ON "documents"("extraction_status", "uploaded_at" DESC);

-- CreateIndex
CREATE INDEX "cost_records_period_start_idx" ON "cost_records"("period_start");

-- CreateIndex
CREATE INDEX "cost_records_cost_type_idx" ON "cost_records"("cost_type");

-- CreateIndex
CREATE INDEX "cost_records_supplier_id_idx" ON "cost_records"("supplier_id");

-- CreateIndex
CREATE INDEX "cost_records_location_id_idx" ON "cost_records"("location_id");

-- CreateIndex
CREATE INDEX "cost_records_anomaly_status_idx" ON "cost_records"("anomaly_status");

-- CreateIndex
CREATE UNIQUE INDEX "cost_records_supplier_id_invoice_number_key" ON "cost_records"("supplier_id", "invoice_number");

-- CreateIndex
CREATE INDEX "anomalies_status_severity_idx" ON "anomalies"("status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "anomalies_cost_record_id_type_key" ON "anomalies"("cost_record_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_anomaly_id_channel_key" ON "alerts"("anomaly_id", "channel");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_performed_by_idx" ON "audit_logs"("performed_by");

-- CreateIndex
CREATE INDEX "audit_logs_performed_at_idx" ON "audit_logs"("performed_at");

-- CreateIndex
CREATE INDEX "login_attempts_email_attempted_at_idx" ON "login_attempts"("email", "attempted_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_address_attempted_at_idx" ON "login_attempts"("ip_address", "attempted_at");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_processing_at_next_attempt_at_idx" ON "outbox_events"("processed_at", "processing_at", "next_attempt_at");

-- CreateIndex
CREATE INDEX "cost_record_monthly_agg_year_idx" ON "cost_record_monthly_agg"("year");

-- CreateIndex
CREATE UNIQUE INDEX "cost_record_monthly_agg_year_month_location_id_supplier_id__key" ON "cost_record_monthly_agg"("year", "month", "location_id", "supplier_id", "cost_type");

-- CreateIndex
CREATE INDEX "cost_seasonal_baseline_month_of_year_idx" ON "cost_seasonal_baseline"("month_of_year");

-- CreateIndex
CREATE UNIQUE INDEX "cost_seasonal_baseline_location_id_supplier_id_cost_type_mo_key" ON "cost_seasonal_baseline"("location_id", "supplier_id", "cost_type", "month_of_year");

-- CreateIndex
CREATE INDEX "anomaly_suppressions_anomaly_type_location_id_supplier_id_c_idx" ON "anomaly_suppressions"("anomaly_type", "location_id", "supplier_id", "cost_type");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_is_active_idx" ON "api_keys"("key_hash", "is_active");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_organization_id_fkey" FOREIGN KEY ("parent_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_parent_cost_center_id_fkey" FOREIGN KEY ("parent_cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_anomaly_acknowledged_by_fkey" FOREIGN KEY ("anomaly_acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "cost_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_cost_record_id_fkey" FOREIGN KEY ("cost_record_id") REFERENCES "cost_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_anomaly_id_fkey" FOREIGN KEY ("anomaly_id") REFERENCES "anomalies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_suppressions" ADD CONSTRAINT "anomaly_suppressions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

