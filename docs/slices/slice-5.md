# Slice 5: SSO + API Access

> **Wochen:** 13-14  
> **Ziel:** "Enterprise-Auth + externe Integrationen"

## Deliverable

- SSO (SAML + OIDC)
- API Keys für externe Systeme
- Rate Limiting
- Webhooks
- API Dokumentation (OpenAPI)

## SSO Provider

- Azure AD (OIDC)
- Google Workspace (OIDC)
- Okta (SAML + OIDC)
- Generic SAML 2.0

## API Keys

```prisma
model ApiKey {
  id          String   @id @default(uuid())
  tenantId    String
  name        String
  keyHash     String   @unique
  permissions String[] @default(["read"])
  rateLimit   Int      @default(1000) // per hour
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime @default(now())
  
  @@index([tenantId])
}
```

## Webhooks

```prisma
model Webhook {
  id        String   @id @default(uuid())
  tenantId  String
  url       String
  events    String[] // anomaly.created, cost_record.created, etc.
  secret    String
  isActive  Boolean  @default(true)
  
  @@index([tenantId])
}
```

## Definition of Done

- [ ] SSO Login funktioniert (mind. Azure AD)
- [ ] API Keys können erstellt werden
- [ ] Rate Limiting funktioniert
- [ ] Webhooks werden bei Events gefeuert
- [ ] OpenAPI Spec ist aktuell
