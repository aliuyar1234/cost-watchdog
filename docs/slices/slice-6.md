# Slice 6: Hardening + Launch Prep

> **Wochen:** 15-16  
> **Ziel:** "Production-ready V1.0"

## Deliverable

- E2E Tests (Playwright)
- Unit Tests (Vitest)
- Security Review
- Performance Optimierung
- Monitoring Setup
- CI/CD Pipeline
- Dokumentation

## Checkliste

### Security

- [ ] RLS-Tests für alle Tabellen
- [ ] OWASP Top 10 Check
- [ ] Rate Limiting auf allen Endpoints
- [ ] Input Validation
- [ ] SQL Injection Prevention (Prisma parameterized)
- [ ] XSS Prevention
- [ ] CSRF Protection
- [ ] Secure Headers (Helmet)

### Performance

- [ ] Dashboard < 500ms
- [ ] File Upload < 5s
- [ ] Extraction < 30s (LLM) / < 2s (Template)
- [ ] Database Indizes optimiert
- [ ] N+1 Queries eliminiert

### Monitoring

- [ ] Error Tracking (Sentry)
- [ ] APM (OpenTelemetry)
- [ ] Uptime Monitoring
- [ ] Alerting (PagerDuty/Slack)
- [ ] Metriken Dashboard

### CI/CD

- [ ] GitHub Actions
- [ ] Lint + Type Check
- [ ] Unit Tests
- [ ] E2E Tests
- [ ] Auto-Deploy to Staging
- [ ] Manual Deploy to Production

### Documentation

- [ ] README aktuell
- [ ] API Docs (OpenAPI)
- [ ] User Guide (Notion/GitBook)
- [ ] Runbook für Ops

## Launch Checklist

- [ ] Backup Strategy getestet
- [ ] Disaster Recovery Plan dokumentiert
- [ ] GDPR Compliance Check
- [ ] Impressum + Datenschutzerklärung
- [ ] Support E-Mail eingerichtet
- [ ] Onboarding Flow getestet
- [ ] Pricing Page live
