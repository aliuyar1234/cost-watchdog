# Anomaly Engine

This document describes the implemented anomaly detection engine in `packages/core/src/anomaly` and its runtime integration in `apps/api/src/workers/anomaly.worker.ts`.

## Engine location

- Core engine: `packages/core/src/anomaly/engine.ts`
- Check definitions: `packages/core/src/anomaly/checks/*`
- Runtime worker integration: `apps/api/src/workers/anomaly.worker.ts`

## Detection lifecycle

1. A new cost record is persisted.
2. Outbox emits `cost_record.created`.
3. Anomaly worker consumes queue job.
4. Worker loads current record + historical context.
5. `AnomalyEngine.detect(...)` runs enabled checks.
6. Triggered findings are upserted into `anomalies`.
7. Warning/critical anomalies (non-backfill) emit `anomaly.detected` for alerting.

## Implemented checks

Current checks (IDs):

- `yoy_deviation`
- `mom_deviation`
- `price_per_unit_spike`
- `statistical_outlier`
- `duplicate_detection`
- `missing_period`
- `seasonal_anomaly`
- `budget_exceeded`

These are exported via `ALL_CHECKS` and filtered by:

- enabled check IDs in settings
- applicable cost type
- minimum historical data requirement (if configured on check)

## Settings and thresholds

Default thresholds are defined in `packages/core/src/anomaly/types.ts`:

- YoY deviation percent
- MoM deviation percent
- price-per-unit deviation percent
- z-score threshold
- budget exceeded percent

Runtime overrides are loaded from `app_settings.settings.thresholds` in the anomaly worker.

Thresholds are cached for 60 seconds and then reloaded.

## Historical context window

Worker currently loads up to 24 months of prior records for the same location + supplier context.

Checks with `minHistoricalMonths` are skipped when insufficient history is available.

## Severity and status

Triggered anomalies are persisted with:

- `severity`: typically `warning` or `critical` depending on check result.
- `status`: initial `new`, then lifecycle transitions (`acknowledged`, `resolved`, `false_positive`).

Lifecycle operations are exposed on anomaly write routes.

## Backfill behavior

When `isBackfill=true`:

- anomalies are still stored
- alert creation is suppressed

This prevents notification noise during historical imports.

## Extending the engine

To add a new check:

1. Implement `AnomalyCheck` in `packages/core/src/anomaly/checks`.
2. Export it in `checks/index.ts`.
3. Add it to `ALL_CHECKS`.
4. Add unit tests in `packages/core`.
5. If needed, expose new threshold settings in app settings.

## Operational note

The worker mutates `minHistoricalMonths` on the YoY check at runtime based on app settings.
That works in-process, but if check state needs per-job isolation in future, clone check config before execution.
