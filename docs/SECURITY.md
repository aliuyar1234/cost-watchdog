# Security Features

Cost Watchdog implements enterprise-grade security measures across all layers of the application. This document provides a comprehensive overview of the security features available.

---

## Table of Contents

- [Authentication & Authorization](#authentication--authorization)
- [API Security](#api-security)
- [Data Protection](#data-protection)
- [Session Management](#session-management)
- [Input Validation & Sanitization](#input-validation--sanitization)
- [Audit Logging](#audit-logging)
- [Rate Limiting & DDoS Protection](#rate-limiting--ddos-protection)
- [File Upload Security](#file-upload-security)
- [Multi-Factor Authentication (MFA)](#multi-factor-authentication-mfa)
- [GDPR Compliance](#gdpr-compliance)
- [Infrastructure Security](#infrastructure-security)
- [Security Configuration](#security-configuration)

---

## Authentication & Authorization

### Role-Based Access Control (RBAC)

Cost Watchdog implements a comprehensive RBAC system with five distinct roles:

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, user management, audit logs, all features |
| **Manager** | Document management, anomaly handling, analytics, exports |
| **Analyst** | View documents, acknowledge anomalies, analytics, exports |
| **Viewer** | Read-only access to dashboards and reports |
| **Auditor** | Read-only access including audit logs for compliance |

### JWT Token Security

- **Short-lived access tokens** (15 minutes default)
- **Secure refresh token rotation** with automatic invalidation
- **HttpOnly, Secure, SameSite cookies** for token storage
- **Token blacklisting** on logout via Redis

### Account Lockout Protection

Protects against brute-force attacks:

```
Configuration:
- Max attempts: 5 (configurable)
- Lockout duration: 15 minutes (configurable)
- Progressive delays after failed attempts
```

### Password Policy

Strong password requirements enforced:

- Minimum 12 characters (configurable)
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character
- Password history tracking (prevents reuse of last 5 passwords)
- Breached password detection via Have I Been Pwned API

---

## API Security

### API Key Authentication

For machine-to-machine communication:

- **Scoped permissions**: `read`, `write`, `delete`, `admin`
- **Resource-specific scopes**: `documents:read`, `anomalies:write`, etc.
- **Automatic key hashing** with bcrypt
- **Key rotation support** without downtime
- **Audit trail** for all API key operations

### CSRF Protection

Cross-Site Request Forgery prevention:

- Double-submit cookie pattern
- Per-request token generation
- Automatic validation on state-changing operations
- Exemptions for API key authenticated requests

### Request ID Tracking

Every request receives a unique ID:

- Correlation across distributed systems
- Included in all log entries
- Returned in response headers (`X-Request-ID`)
- Supports incoming `X-Request-ID` for external correlation

---

## Data Protection

### Field-Level Encryption

Sensitive data encrypted at rest using AES-256-GCM:

```typescript
Encrypted Fields:
- Invoice numbers
- Contract numbers
- MFA secrets
- Backup codes
```

Features:
- **Key versioning** for rotation support
- **Automatic re-encryption** when keys rotate
- **Transparent encryption/decryption** via Prisma middleware
- **Base64 encoding** for database storage

### Secure Logging

Automatic redaction of sensitive data in logs:

| Data Type | Redaction Pattern |
|-----------|-------------------|
| Passwords | `[REDACTED]` |
| Tokens | `Bearer [REDACTED]` |
| API Keys | `[REDACTED]` |
| Email addresses | `j***@example.com` |
| MFA codes | `[REDACTED]` |
| Cookies | `[REDACTED]` |

### Database Security

- **Parameterized queries** via Prisma ORM (SQL injection prevention)
- **Connection pooling** with health checks
- **Encrypted connections** in production
- **Minimal privilege principle** for database users

---

## Session Management

### Session Fixation Prevention

- New session ID generated on authentication state changes
- Old session tokens invalidated on privilege escalation
- Session binding to user agent and IP (configurable)

### Active Session Management

Users can view and manage their sessions:

```
GET /api/v1/users/me/sessions     # List active sessions
DELETE /api/v1/users/me/sessions/:id  # Revoke specific session
DELETE /api/v1/users/me/sessions      # Revoke all sessions
```

Session information includes:
- Device/browser information
- IP address (privacy-compliant)
- Last activity timestamp
- Creation timestamp

### Token Rotation

Automatic refresh token rotation:

```
1. User authenticates → receives access + refresh tokens
2. Access token expires (15min)
3. Client uses refresh token to get new tokens
4. Old refresh token is immediately invalidated
5. New access + refresh tokens issued
```

---

## Input Validation & Sanitization

### Schema Validation

All inputs validated using Zod schemas:

- Request body validation
- Query parameter validation
- Path parameter validation
- Type coercion and transformation

### XSS Prevention

- HTML entity encoding for user-provided content
- Content-Security-Policy headers
- No inline scripts allowed
- DOM-based XSS protection

### Security Headers

Applied via Helmet.js:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Referrer-Policy: strict-origin-when-cross-origin
```

---

## Audit Logging

### Comprehensive Audit Trail

All security-relevant actions are logged:

| Category | Events Logged |
|----------|---------------|
| **Authentication** | Login, logout, failed attempts, MFA events |
| **Authorization** | Permission changes, role assignments |
| **Data Access** | Document views, exports, downloads |
| **Data Modification** | Create, update, delete operations |
| **Admin Actions** | User management, settings changes |
| **Security Events** | Password changes, API key operations |

### Audit Log Structure

```json
{
  "id": "uuid",
  "performedAt": "2024-12-10T12:00:00Z",
  "action": "USER_LOGIN",
  "resource": "auth",
  "resourceId": "user-123",
  "userId": "user-123",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "changes": { "before": {}, "after": {} },
  "metadata": { "requestId": "req-456" }
}
```

### Retention & Archival

- Configurable retention periods
- Automatic archival before deletion
- Immutable audit records
- Admin and auditor access only

---

## Rate Limiting & DDoS Protection

### Sliding Window Rate Limiting

Redis-backed rate limiting with configurable limits:

| Endpoint Category | Requests | Window |
|-------------------|----------|--------|
| **Authentication** | 5 | 15 minutes |
| **Password Reset** | 3 | 1 hour |
| **API (default)** | 100 | 1 minute |
| **Uploads** | 10 | 1 minute |

### Rate Limit Response

When limits are exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1702209600
```

### Fail-Closed Behavior

If Redis is unavailable, requests are blocked rather than allowed (configurable):

```typescript
rateLimitConfig: {
  failClosed: true,  // Block on Redis failure
  fallbackLimit: 10  // Conservative limit if failClosed is false
}
```

---

## File Upload Security

### File Validation

Multi-layer validation for all uploads:

1. **Extension whitelist**: `.pdf`, `.xlsx`, `.xls`, `.csv`
2. **MIME type validation**: Must match allowed content types
3. **Magic byte verification**: Actual file content inspection
4. **Size limits**: 10MB default (configurable)
5. **Filename sanitization**: Remove path traversal, special characters

### Malware Protection

- File content scanning
- Executable content detection
- Embedded macro detection (Office files)
- Archive inspection (no nested bombs)

### Secure Storage

- Files stored in isolated S3-compatible storage
- Unique, non-guessable file paths
- Content-Disposition headers for safe downloads
- Signed URLs for temporary access

---

## Multi-Factor Authentication (MFA)

### TOTP Support

Time-based One-Time Password (RFC 6238):

- Compatible with Google Authenticator, Authy, 1Password
- QR code provisioning
- 30-second token windows
- Configurable time drift tolerance

### Backup Codes

Emergency access when device unavailable:

- 10 single-use backup codes
- Secure generation using crypto.randomBytes
- Encrypted storage
- Regeneration invalidates previous codes

### MFA Management Endpoints

```
POST /api/v1/mfa/setup          # Generate QR code and secret
POST /api/v1/mfa/verify         # Verify and enable MFA
POST /api/v1/mfa/disable        # Disable MFA (requires verification)
POST /api/v1/mfa/backup-codes   # Regenerate backup codes
GET  /api/v1/mfa/status         # Check MFA status
```

---

## GDPR Compliance

### Data Subject Rights

Full support for GDPR data subject rights:

#### Right to Access (Art. 15)
```
GET /api/v1/users/me/data-export
```
Returns all personal data in machine-readable JSON format.

#### Right to Erasure (Art. 17)
```
POST /api/v1/users/me/deletion-request
```
Triggers account deletion workflow with:
- Confirmation email with secure token
- 24-hour cooling-off period
- Cascading deletion of all related data
- Audit log preserved (anonymized)

#### Right to Rectification (Art. 16)
```
PATCH /api/v1/users/me
```
Users can update their personal information.

### Data Retention

Configurable retention periods with automatic cleanup:

| Data Type | Default Retention |
|-----------|-------------------|
| Audit logs | 365 days |
| Login attempts | 90 days |
| Password reset tokens | 7 days |
| Processed outbox events | 30 days |
| Token blacklist entries | Until expiry |

### Anonymization

When deletion is requested:
- Personal identifiers replaced with anonymized values
- Email: `deleted-{hash}@deleted.local`
- Name: `Deleted User`
- IP addresses in logs: hashed or removed
- Related records: cascade delete or anonymize

---

## Infrastructure Security

### Container Security

- **Non-root execution**: All containers run as unprivileged users
- **Read-only filesystems**: Where applicable
- **Resource limits**: CPU and memory constraints
- **Health checks**: Automatic restart on failure
- **Minimal base images**: Alpine-based for smaller attack surface

### Secrets Management

Production secrets management:

```yaml
# docker-compose.prod.yml
services:
  api:
    secrets:
      - db_password
      - jwt_secret
      - field_encryption_key
secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### Network Security

- **Localhost binding**: Development services bound to 127.0.0.1
- **Traefik reverse proxy**: TLS termination, rate limiting
- **Let's Encrypt integration**: Automatic certificate management
- **HSTS enabled**: Force HTTPS connections

### CI/CD Security

- **Trivy scanning**: Container and filesystem vulnerability detection
- **TruffleHog**: Secret detection in code
- **npm audit**: Dependency vulnerability scanning
- **Pinned action versions**: Supply chain attack prevention

---

## Security Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_SECRET` | JWT signing secret | Required in production |
| `COOKIE_SECRET` | Cookie signing secret | Required in production |
| `FIELD_ENCRYPTION_KEY` | AES-256 encryption key | Required in production |
| `PASSWORD_MIN_LENGTH` | Minimum password length | 12 |
| `LOCKOUT_MAX_ATTEMPTS` | Failed attempts before lockout | 5 |
| `LOCKOUT_DURATION_MINUTES` | Lockout duration | 15 |
| `RATE_LIMIT_DEFAULT` | Default rate limit | 100/minute |
| `MFA_REQUIRED` | Require MFA for all users | false |

### Production Checklist

Before deploying to production, ensure:

- [ ] `NODE_ENV=production` is set
- [ ] All `*_SECRET` variables use strong random values (32+ chars)
- [ ] `FIELD_ENCRYPTION_KEY` is set (64 hex chars for AES-256)
- [ ] Database uses SSL/TLS connections
- [ ] Redis requires authentication
- [ ] S3/MinIO credentials are production-specific
- [ ] Rate limiting is configured appropriately
- [ ] Audit logging is enabled
- [ ] Log aggregation is configured
- [ ] Monitoring and alerting are set up
- [ ] Backup procedures are tested

---

## Security Testing

### Test Coverage

The security implementation includes comprehensive tests:

```
537 tests passing

Test Categories:
- Authentication flows (login, logout, token refresh)
- Authorization (RBAC, permissions)
- Rate limiting (sliding window, fail-closed)
- Input validation (XSS, injection)
- File upload security (type validation, sanitization)
- MFA (TOTP, backup codes)
- Audit logging (completeness, accuracy)
- Session management (fixation, rotation)
- GDPR workflows (export, deletion)
- Encryption (field-level, key rotation)
```

### Security Scanning

Automated security scanning in CI/CD:

```yaml
# Vulnerability scanning
- npm audit --audit-level=moderate
- trivy fs --exit-code 1 --severity HIGH,CRITICAL
- trufflehog git file://. --fail
```

---

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** create a public GitHub issue
2. Email security concerns to the development team
3. Include detailed reproduction steps
4. Allow 90 days for remediation before disclosure

---

## Compliance

Cost Watchdog is designed to support compliance with:

- **GDPR** (General Data Protection Regulation)
- **ISO 27001** (Information Security Management)
- **SOC 2** (Service Organization Control)
- **OWASP Top 10** (Web Application Security)

---

<p align="center">
  <sub>Security is not a feature, it's a requirement.</sub>
</p>
