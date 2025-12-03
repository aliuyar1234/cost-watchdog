# Slice 3: Dashboard + Analytics

> **Wochen:** 8-10  
> **Ziel:** "Dashboard zeigt Überblick + Export funktioniert"

## Deliverable

Am Ende von Slice 3:
- Vollständiges Dashboard mit KPIs und Charts
- Kostenentwicklung über Zeit (Liniendiagramm)
- Aufschlüsselung nach Kategorie/Standort/Lieferant
- Excel/PDF Export

## Aufgaben

### Woche 8: Aggregat-Tabellen + Analytics API

**Aggregat-Tabelle:**

```prisma
model CostRecordMonthlyAgg {
  tenantId    String
  year        Int
  month       Int
  locationId  String?
  supplierId  String?
  costType    String?
  
  amountSum   Decimal  @db.Decimal(18, 4)
  quantitySum Decimal? @db.Decimal(18, 4)
  recordCount Int
  
  lastUpdatedAt DateTime @default(now())
  
  @@id([tenantId, year, month, locationId, supplierId, costType])
}
```

**Analytics Endpoints:**

```
GET /api/v1/analytics/dashboard
GET /api/v1/analytics/trends?period=12m
GET /api/v1/analytics/by-location
GET /api/v1/analytics/by-supplier
GET /api/v1/analytics/by-cost-type
```

### Woche 9: Dashboard UI

- KPI Cards (Gesamtkosten, vs. Vorjahr, Anomalien)
- Kostenentwicklung Chart (Recharts)
- Top 5 Standorte/Lieferanten
- Kritische Anomalien Liste

### Woche 10: Reports + Export

- Monats-Report PDF (mit Charts)
- Excel Export (alle Daten)
- Scheduled Reports (Cron)

## Definition of Done

- [ ] Dashboard lädt < 500ms
- [ ] Charts zeigen korrekte Daten
- [ ] Excel Export funktioniert
- [ ] PDF Report generiert

## Wichtig: Performance

```typescript
// Dashboard liest aus Aggregaten!
const summary = await prisma.costRecordMonthlyAgg.findMany({
  where: { tenantId, year },
});

// NICHT: SELECT SUM(amount) FROM cost_records ...
```
