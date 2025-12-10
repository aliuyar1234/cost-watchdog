/**
 * Prometheus Metrics Service
 *
 * Provides application metrics for monitoring via /metrics endpoint.
 * Uses prom-client for Prometheus-compatible metrics.
 */

import client from 'prom-client';

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY SETUP
// ═══════════════════════════════════════════════════════════════════════════

// Create a custom registry to avoid default metrics pollution
const register = new client.Registry();

// Add default metrics (process CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// ═══════════════════════════════════════════════════════════════════════════
// HTTP METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTTP request counter - tracks total requests by method, path, and status
 */
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

/**
 * HTTP request duration histogram - tracks request latency
 */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * HTTP request size histogram - tracks request body sizes
 */
export const httpRequestSize = new client.Histogram({
  name: 'http_request_size_bytes',
  help: 'HTTP request body size in bytes',
  labelNames: ['method', 'path'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

/**
 * HTTP response size histogram - tracks response body sizes
 */
export const httpResponseSize = new client.Histogram({
  name: 'http_response_size_bytes',
  help: 'HTTP response body size in bytes',
  labelNames: ['method', 'path', 'status'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Audit log events counter
 */
export const auditLogsTotal = new client.Counter({
  name: 'audit_logs_total',
  help: 'Total number of audit log events',
  labelNames: ['action', 'entity_type'] as const,
  registers: [register],
});

/**
 * Failed login attempts counter
 */
export const failedLoginAttemptsTotal = new client.Counter({
  name: 'failed_login_attempts_total',
  help: 'Total number of failed login attempts',
  labelNames: ['reason'] as const,
  registers: [register],
});

/**
 * Account lockouts counter
 */
export const accountLockoutsTotal = new client.Counter({
  name: 'account_lockouts_total',
  help: 'Total number of account lockouts',
  registers: [register],
});

/**
 * Active sessions gauge
 */
export const activeSessionsGauge = new client.Gauge({
  name: 'active_sessions',
  help: 'Number of active user sessions',
  registers: [register],
});

/**
 * Anomalies detected counter
 */
export const anomaliesDetectedTotal = new client.Counter({
  name: 'anomalies_detected_total',
  help: 'Total number of anomalies detected',
  labelNames: ['type', 'severity'] as const,
  registers: [register],
});

/**
 * Documents processed counter
 */
export const documentsProcessedTotal = new client.Counter({
  name: 'documents_processed_total',
  help: 'Total number of documents processed',
  labelNames: ['status'] as const,
  registers: [register],
});

/**
 * API key usage counter
 */
export const apiKeyUsageTotal = new client.Counter({
  name: 'api_key_usage_total',
  help: 'Total number of API key authentications',
  labelNames: ['key_prefix'] as const,
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Database query duration histogram
 */
export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

/**
 * Database connection pool gauge
 */
export const dbConnectionPool = new client.Gauge({
  name: 'db_connection_pool_size',
  help: 'Database connection pool size',
  labelNames: ['state'] as const,
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKER METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Background job counter
 */
export const backgroundJobsTotal = new client.Counter({
  name: 'background_jobs_total',
  help: 'Total number of background jobs processed',
  labelNames: ['queue', 'status'] as const,
  registers: [register],
});

/**
 * Background job duration histogram
 */
export const backgroundJobDuration = new client.Histogram({
  name: 'background_job_duration_seconds',
  help: 'Background job processing duration in seconds',
  labelNames: ['queue'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the Prometheus registry for the /metrics endpoint
 */
export function getMetricsRegistry(): client.Registry {
  return register;
}

/**
 * Get metrics in Prometheus text format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics content type header
 */
export function getMetricsContentType(): string {
  return register.contentType;
}

/**
 * Normalize path for metrics labels (remove IDs, limit cardinality)
 */
export function normalizePath(path: string): string {
  // Remove query strings
  const basePath = path.split('?')[0] ?? path;

  // Replace UUIDs with placeholder
  const normalizedPath = basePath.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );

  // Replace numeric IDs with placeholder
  return normalizedPath.replace(/\/\d+/g, '/:id');
}

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  requestSize?: number,
  responseSize?: number
): void {
  const normalizedPath = normalizePath(path);
  const statusStr = status.toString();

  httpRequestsTotal.labels(method, normalizedPath, statusStr).inc();
  httpRequestDuration.labels(method, normalizedPath, statusStr).observe(durationMs / 1000);

  if (requestSize !== undefined) {
    httpRequestSize.labels(method, normalizedPath).observe(requestSize);
  }

  if (responseSize !== undefined) {
    httpResponseSize.labels(method, normalizedPath, statusStr).observe(responseSize);
  }
}
