# Slice 2: Anomaly Detection + Alerting

> **Wochen:** 5-7  
> **Ziel:** "Anomalie erkannt → E-Mail → Review in UI"

## Deliverable

Am Ende von Slice 2:
- System erkennt Anomalien in CostRecords
- Anomalien haben Severity (info/warning/critical)
- E-Mail Alerts werden verschickt
- User kann Anomalien reviewen (bestätigen/ablehnen)

## Aufgaben

### Woche 5: Anomaly Engine

**8 Checks implementieren:**

| Check | Logik | Severity |
|-------|-------|----------|
| YoY Deviation | >20% vs. Vorjahresmonat | Warning/Critical |
| MoM Deviation | >30% vs. Vormonat | Warning/Critical |
| Price/Unit Spike | >10% über 6-Monats-Durchschnitt | Warning/Critical |
| Z-Score Outlier | Z-Score >2 | Warning/Critical |
| Duplicate | Gleicher Lieferant + Betrag + Zeitraum | Warning |
| Missing Period | Lücke >45 Tage | Info |
| Seasonal Anomaly | Ungewöhnlich für Saison | Info |
| Budget Exceeded | Budget überschritten | Warning/Critical |

**Anomaly Entity:**

```prisma
model Anomaly {
  id            String   @id @default(uuid())
  tenantId      String
  costRecordId  String
  
  type          String   // yoy_deviation, mom_deviation, etc.
  severity      String   // info, warning, critical
  message       String
  details       Json     // expectedValue, actualValue, deviationPercent
  
  status        String   @default("new") // new, acknowledged, resolved, false_positive
  acknowledgedBy String?
  acknowledgedAt DateTime?
  
  isBackfill    Boolean  @default(false)
  detectedAt    DateTime @default(now())
  
  @@unique([tenantId, costRecordId, type])
  @@index([tenantId, status, severity])
}
```

### Woche 6: Alerting + E-Mail

- Alert Entity + API
- Resend Integration
- Daily Digest Option
- Alert-Fatigue Protection (max X/Tag)

### Woche 7: Anomaly UI

- Anomaly-Liste mit Filtern
- Detail-Ansicht mit Kontext
- Actions: Bestätigen, Ablehnen, False Positive
- Badge im Dashboard

## Definition of Done

- [ ] Alle 8 Checks implementiert
- [ ] Anomalien werden bei jedem neuen CostRecord geprüft
- [ ] E-Mail Alerts funktionieren
- [ ] Anomaly-UI zeigt alle offenen Anomalien
- [ ] User kann Anomalien bestätigen/ablehnen
- [ ] Backfill-Mode sendet keine Alerts

## Wichtig: Cold Start

```typescript
// Keine YoY Alerts ohne 12 Monate Historie!
if (historicalMonths < 12) {
  return { triggered: false, reason: 'insufficient_baseline' };
}
```

## Wichtig: Backfill Mode

```typescript
// Bei historischem Import: Anomalien berechnen, aber KEINE E-Mails!
if (options.mode === 'backfill') {
  await createAnomaly({ ...anomaly, isBackfill: true });
  // KEIN Alert!
}
```
