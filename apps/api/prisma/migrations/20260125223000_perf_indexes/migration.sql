-- Performance indexes for hot query paths.

-- cost_records
CREATE INDEX "cost_records_cost_center_id_idx" ON "cost_records"("cost_center_id");
CREATE INDEX "cost_records_source_doc_location_cost_center_idx"
  ON "cost_records"("source_document_id", "location_id", "cost_center_id");
CREATE INDEX "cost_records_location_supplier_period_start_idx"
  ON "cost_records"("location_id", "supplier_id", "period_start" DESC);
CREATE INDEX "cost_records_period_start_created_at_idx"
  ON "cost_records"("period_start" DESC, "created_at" DESC);

-- anomalies
CREATE INDEX "anomalies_status_severity_detected_at_idx"
  ON "anomalies"("status", "severity", "detected_at" DESC);

-- alerts
CREATE INDEX "alerts_created_at_idx" ON "alerts"("created_at" DESC);
CREATE INDEX "alerts_status_created_at_idx" ON "alerts"("status", "created_at" DESC);

-- login_attempts
CREATE INDEX "login_attempts_attempted_at_idx" ON "login_attempts"("attempted_at");

-- cost_record_monthly_agg
CREATE INDEX "cost_record_monthly_agg_year_location_idx"
  ON "cost_record_monthly_agg"("year", "location_id");
CREATE INDEX "cost_record_monthly_agg_year_supplier_idx"
  ON "cost_record_monthly_agg"("year", "supplier_id");
CREATE INDEX "cost_record_monthly_agg_year_cost_type_idx"
  ON "cost_record_monthly_agg"("year", "cost_type");

