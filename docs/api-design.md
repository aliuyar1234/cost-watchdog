# API Design

This page describes the currently implemented API behavior.

## Base URL and versioning

- Base path: `/api/v1`
- Health routes are outside version prefix: `/health`, `/health/detailed`
- Metrics route is outside version prefix: `/metrics`

## OpenAPI exposure

OpenAPI routes are conditionally registered:

- `/api/v1/openapi.json`
- `/api/v1/openapi.yaml`
- `/api/v1/docs`

Default behavior:

- Development/test: enabled
- Production: disabled unless `OPENAPI_DOCS_ENABLED=true`

## Authentication model

### User authentication

- JWT access + refresh tokens are issued by auth endpoints.
- Tokens are primarily transported via HttpOnly cookies.
- Bearer token header is also supported.

### API key authentication

- `x-api-key` header supported.
- API keys carry scopes (for example `read:analytics`, `write:documents`).
- Route protection combines scope checks and role checks where required.

### CSRF

- State-changing requests require CSRF validation (double-submit cookie pattern).
- CSRF token endpoint: `GET /api/v1/csrf/token`
- API-key-authenticated requests skip CSRF checks.

## Authorization model

### Role-based gates

Roles used in route guards include:

- `admin`
- `manager`
- `auditor`
- `viewer`

Examples:

- User/admin management endpoints: admin only.
- Exports: manager/admin.
- Audit logs: admin/auditor.

### Scope-based gates

Representative scopes:

- `read:documents`, `write:documents`
- `read:anomalies`, `write:anomalies`
- `read:alerts`, `write:alerts`
- `read:analytics`
- `read:exports`
- `read:users`, `write:users`

## Route groups

### Auth (`/api/v1/auth`)

- `POST /register`
- `POST /login`
- `POST /refresh`
- `POST /forgot-password`
- `POST /reset-password`
- `GET /me`
- `POST /logout`

### Documents (`/api/v1/documents`)

- `POST /upload`
- `GET /`
- `GET /:id`
- `GET /:id/download`
- `POST /:id/retry-extraction`
- `DELETE /:id`

### Anomalies (`/api/v1/anomalies`)

- `GET /`
- `GET /stats`
- `GET /:id`
- `POST /:id/acknowledge`
- `POST /:id/resolve`
- `POST /:id/false-positive`
- `PATCH /:id`

### Alerts (`/api/v1/alerts`)

- `GET /`
- `GET /stats`
- `GET /:id`
- `POST /:id/retry`
- `POST /:id/track-click`

### Analytics (`/api/v1/analytics`)

- `GET /dashboard`
- `GET /trends`
- `GET /comparison`
- `GET /by-cost-type`
- `GET /by-location`
- `GET /by-supplier`

### Exports (`/api/v1/exports`)

- `GET /cost-records`
- `GET /anomalies`
- `GET /monthly-report`

### Users and sessions

- Users: `/api/v1/users`
- Sessions: `/api/v1/users/:id/sessions` and `/:sessionId`
- Includes lifecycle, security, and GDPR operations.

### API keys (`/api/v1/api-keys`)

- List/get/create/revoke keys.
- `GET /scopes` for scope catalog.

### Settings and notification settings

- `/api/v1/settings`
- `/api/v1/notification-settings`

### MFA (`/api/v1/mfa`)

- Status, enrollment, verification, backup code use/regeneration, disable.

### Audit logs (`/api/v1/audit-logs`)

- Query and single-entry read for admin/auditor roles.

## Error and rate-limit behavior

- Standard JSON error shape is used across routes (`error`, `message`, optional details).
- Endpoint-specific rate limits are applied for auth/upload/export flows.
- Global default rate limit hook is active for API requests.

## Observability endpoints

### `/metrics`

- Prometheus text endpoint.
- In production, endpoint is disabled if `METRICS_TOKEN` is missing.
- If token is configured, bearer auth is required.

### `/health` and `/health/detailed`

- `/health`: minimal in production, detailed in non-production.
- `/health/detailed`: authenticated admin-only diagnostics.
