# Security Notes

This document describes security controls that are currently implemented in the codebase.

For vulnerability disclosure policy, see root `SECURITY.md`.

## Security architecture summary

Primary controls are implemented in `apps/api`:

- Auth/token verification middleware
- CSRF middleware
- API key scope checks
- Rate limiting hooks
- Account lockout logic
- Secure logging redaction
- Optional MFA and field encryption
- Audit logging and session lifecycle controls

## Implemented controls

### 1. Authentication and sessions

- Access and refresh tokens are signed with `AUTH_SECRET`.
- Access token verification enforces issuer/audience and expected claims.
- Session IDs (`jti`) are used for session tracking.
- Token blacklist and session blacklist checks are enforced on authenticated routes.
- Refresh token rotation with family tracking and reuse detection is implemented.

### 2. Authorization

- Route-level role guards (for example admin/manager/auditor restrictions).
- API keys are stored hashed (`api_keys.keyHash`) and validated by scope.
- Scope checks are applied per route group.

### 3. CSRF protection

- Double-submit cookie CSRF for state-changing requests.
- Token endpoint: `/api/v1/csrf/token`.
- CSRF checks are skipped for API key authenticated requests and selected safe paths.

### 4. Password and lockout defenses

- Registration path enforces a strong password policy (`validatePassword`).
- Passwords are hashed with Argon2.
- Failed login attempts are tracked in Redis.
- Progressive lockout and permanent lockout escalation are implemented.
- Admin unlock endpoint is available for locked accounts.

### 5. Transport and header hardening

- Helmet is enabled with CSP and other security headers.
- HSTS is enabled in production.
- Cookie handling is configured with secure defaults.

### 6. Rate limiting

- Global default rate limit hook is active.
- Endpoint-specific limits for auth, upload, export, and API-key traffic.
- Production behavior is fail-closed on critical rate-limit backend errors.

### 7. Secrets and sensitive data handling

- Secrets are read from `/run/secrets/*` with env fallback.
- Secure logger serializers redact auth headers/tokens/password-like fields.
- Optional AES-256-GCM field encryption with key versioning is available.

### 8. Auditing and traceability

- Audit logs capture sensitive lifecycle operations.
- Request context fields (request id, ip, user-agent) are propagated into audit events.
- GDPR deletion flow records and anonymizes relevant traces as implemented.

### 9. Monitoring endpoint safety

- `/metrics` is token-gated when `METRICS_TOKEN` is configured.
- In production, `/metrics` is disabled (503) when token is missing.

## Configuration requirements

Minimum production requirements:

- Strong `AUTH_SECRET` (32+ chars).
- Proper `DATABASE_URL`, `REDIS_URL`, and S3 credentials.
- `METRICS_TOKEN` set for Prometheus scraping.
- `NODE_ENV=production`.

Recommended:

- `FIELD_ENCRYPTION_KEY` configured.
- Reverse proxy correctly configured with `TRUST_PROXY`.
- `OPENAPI_DOCS_ENABLED` left disabled unless explicitly needed.

## Current limitations and hardening opportunities

These are areas to improve further:

- No built-in malware/virus scanning of uploaded files.
- No WAF/DDoS layer in-repo; deploy behind managed edge controls.
- Some admin user-management paths currently use basic password length checks instead of the full registration password policy.
- Threat-model documentation and formal security test suite can be expanded.

## Verification references

Key implementation files:

- `apps/api/src/index.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/middleware/csrf.ts`
- `apps/api/src/lib/rate-limit.ts`
- `apps/api/src/lib/account-lockout.ts`
- `apps/api/src/lib/token-rotation.ts`
- `apps/api/src/middleware/secure-logging.ts`
- `apps/api/src/routes/metrics.ts`
- `apps/api/src/lib/secrets.ts`
