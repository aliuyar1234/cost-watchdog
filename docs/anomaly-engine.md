## Teil 5: Anomaly Detection Engine

### 5.1 Erkennungs-Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ANOMALY DETECTION PIPELINE                            │
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │  Neuer          │                                                       │
│  │  CostRecord     │                                                       │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 1: CONTEXT LADEN                                               │   │
│  │  ─────────────────────                                               │   │
│  │                                                                       │   │
│  │  • Historische Daten (24 Monate)                                     │   │
│  │  • Gleicher Standort                                                 │   │
│  │  • Gleicher Lieferant                                                │   │
│  │  • Gleiche Kostenart                                                 │   │
│  │  • Vertragskonditionen (falls vorhanden)                             │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 2: CHECKS AUSFÜHREN                                            │   │
│  │  ────────────────────────                                            │   │
│  │                                                                       │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │   │
│  │  │ YoY Check   │ │ MoM Check   │ │ Price/Unit  │ │ Z-Score     │    │   │
│  │  │             │ │             │ │ Check       │ │ Check       │    │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │   │
│  │                                                                       │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │   │
│  │  │ Duplicate   │ │ Gap         │ │ Seasonal    │ │ Budget      │    │   │
│  │  │ Check       │ │ Check       │ │ Check       │ │ Check       │    │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 3: SEVERITY BESTIMMEN                                          │   │
│  │  ──────────────────────────                                          │   │
│  │                                                                       │   │
│  │  Multiple Checks → Kombinierte Severity                              │   │
│  │                                                                       │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                                                                │ │   │
│  │  │  INFO:     Einzelne kleine Abweichung (<20%)                   │ │   │
│  │  │            oder neue Situation (erster Lieferant)             │ │   │
│  │  │                                                                │ │   │
│  │  │  WARNING:  Signifikante Abweichung (20-50%)                    │ │   │
│  │  │            oder mehrere kleine Anomalien                      │ │   │
│  │  │                                                                │ │   │
│  │  │  CRITICAL: Große Abweichung (>50%)                             │ │   │
│  │  │            oder Kombination mehrerer Warnings                 │ │   │
│  │  │            oder potenziell hoher €-Schaden                    │ │   │
│  │  │                                                                │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STEP 4: ANOMALY ERSTELLEN & ALERT TRIGGERN                          │   │
│  │  ──────────────────────────────────────────                          │   │
│  │                                                                       │   │
│  │  if (severity >= threshold) {                                        │   │
│  │    createAnomaly(costRecord, checks, severity);                      │   │
│  │    triggerAlert(anomaly, notificationSettings);                      │   │
│  │  }                                                                   │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Check-Implementierungen

```typescript
// packages/core/src/anomaly/checks/index.ts

interface AnomalyCheck {
  id: string;
  name: string;
  description: string;
  applicableCostTypes: CostType[] | 'all';
  check: (record: CostRecord, context: CheckContext) => Promise<CheckResult>;
}

interface CheckContext {
  location: Location;
  supplier: Supplier;
  historicalRecords: CostRecord[];  // Letzte 24 Monate
  contract?: Contract;
  budget?: Budget;
  settings: TenantSettings;
}

interface CheckResult {
  triggered: boolean;
  severity?: 'info' | 'warning' | 'critical';
  message?: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1: Year-over-Year Deviation
// ─────────────────────────────────────────────────────────────────────────────

export const yoyDeviationCheck: AnomalyCheck = {
  id: 'yoy_deviation',
  name: 'Jahr-über-Jahr Abweichung',
  description: 'Vergleicht mit dem gleichen Monat im Vorjahr',
  applicableCostTypes: 'all',
  
  async check(record, context): Promise<CheckResult> {
    const lastYear = context.historicalRecords.find(r => 
      r.periodStart.getMonth() === record.periodStart.getMonth() &&
      r.periodStart.getFullYear() === record.periodStart.getFullYear() - 1 &&
      r.costType === record.costType
    );
    
    if (!lastYear) {
      return { triggered: false };
    }
    
    const deviation = ((record.amount - lastYear.amount) / lastYear.amount) * 100;
    const threshold = context.settings.alertThresholds.yoyDeviationPercent;
    
    if (Math.abs(deviation) > threshold) {
      const severity = Math.abs(deviation) > threshold * 2 ? 'critical' : 'warning';
      
      return {
        triggered: true,
        severity,
        message: `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}% vs. Vorjahresmonat`,
        details: {
          expectedValue: lastYear.amount,
          actualValue: record.amount,
          deviationPercent: deviation,
          deviationAbsolute: record.amount - lastYear.amount,
          comparisonPeriod: lastYear.periodStart.toISOString(),
          threshold,
          method: 'yoy_comparison'
        }
      };
    }
    
    return { triggered: false };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2: Month-over-Month Deviation
// ─────────────────────────────────────────────────────────────────────────────

export const momDeviationCheck: AnomalyCheck = {
  id: 'mom_deviation',
  name: 'Monat-über-Monat Abweichung',
  description: 'Vergleicht mit dem Vormonat',
  applicableCostTypes: 'all',
  
  async check(record, context): Promise<CheckResult> {
    const lastMonth = context.historicalRecords
      .filter(r => r.costType === record.costType)
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())[0];
    
    if (!lastMonth) {
      return { triggered: false };
    }
    
    const deviation = ((record.amount - lastMonth.amount) / lastMonth.amount) * 100;
    const threshold = context.settings.alertThresholds.momDeviationPercent;
    
    if (Math.abs(deviation) > threshold) {
      return {
        triggered: true,
        severity: Math.abs(deviation) > threshold * 2 ? 'critical' : 'warning',
        message: `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}% vs. Vormonat`,
        details: {
          expectedValue: lastMonth.amount,
          actualValue: record.amount,
          deviationPercent: deviation,
          comparisonPeriod: lastMonth.periodStart.toISOString(),
          method: 'mom_comparison'
        }
      };
    }
    
    return { triggered: false };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3: Price per Unit Spike
// ─────────────────────────────────────────────────────────────────────────────

export const pricePerUnitCheck: AnomalyCheck = {
  id: 'price_per_unit_spike',
  name: 'Preis pro Einheit Anstieg',
  description: 'Erkennt ungewöhnliche Preiserhöhungen',
  applicableCostTypes: ['electricity', 'natural_gas', 'water', 'fuel_diesel', 'fuel_petrol'],
  
  async check(record, context): Promise<CheckResult> {
    if (!record.pricePerUnit || !record.quantity) {
      return { triggered: false };
    }
    
    // Durchschnittspreis der letzten 6 Monate
    const recentRecords = context.historicalRecords
      .filter(r => r.costType === record.costType && r.pricePerUnit)
      .slice(0, 6);
    
    if (recentRecords.length < 3) {
      return { triggered: false };
    }
    
    const avgPrice = recentRecords.reduce((sum, r) => sum + r.pricePerUnit!, 0) / recentRecords.length;
    const deviation = ((record.pricePerUnit - avgPrice) / avgPrice) * 100;
    const threshold = context.settings.alertThresholds.pricePerUnitDeviationPercent;
    
    if (deviation > threshold) {
      return {
        triggered: true,
        severity: deviation > threshold * 2 ? 'critical' : 'warning',
        message: `Preis/Einheit +${deviation.toFixed(1)}% über Durchschnitt`,
        details: {
          expectedValue: avgPrice,
          actualValue: record.pricePerUnit,
          deviationPercent: deviation,
          unit: record.unit,
          method: 'price_per_unit_avg'
        }
      };
    }
    
    return { triggered: false };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 4: Statistical Outlier (Z-Score)
// ─────────────────────────────────────────────────────────────────────────────

export const statisticalOutlierCheck: AnomalyCheck = {
  id: 'statistical_outlier',
  name: 'Statistischer Ausreißer',
  description: 'Erkennt statistisch ungewöhnliche Beträge',
  applicableCostTypes: 'all',
  
  async check(record, context): Promise<CheckResult> {
    const amounts = context.historicalRecords
      .filter(r => r.costType === record.costType)
      .map(r => r.amount);
    
    if (amounts.length < 6) {
      return { triggered: false };
    }
    
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length
    );
    
    if (stdDev === 0) {
      return { triggered: false };
    }
    
    const zScore = (record.amount - mean) / stdDev;
    
    if (Math.abs(zScore) > 2) {
      return {
        triggered: true,
        severity: Math.abs(zScore) > 3 ? 'critical' : 'warning',
        message: `Statistisch ungewöhnlich (${zScore.toFixed(1)} Standardabweichungen)`,
        details: {
          expectedValue: mean,
          actualValue: record.amount,
          zScore,
          standardDeviation: stdDev,
          method: 'zscore'
        }
      };
    }
    
    return { triggered: false };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 5: Duplicate Detection
// ─────────────────────────────────────────────────────────────────────────────

export const duplicateCheck: AnomalyCheck = {
  id: 'duplicate_detection',
  name: 'Duplikat-Erkennung',
  description: 'Erkennt mögliche doppelte Rechnungen',
  applicableCostTypes: 'all',
  
  async check(record, context): Promise<CheckResult> {
    const potentialDuplicates = context.historicalRecords.filter(r =>
      r.id !== record.id &&
      r.supplierId === record.supplierId &&
      r.amount === record.amount &&
      Math.abs(r.periodStart.getTime() - record.periodStart.getTime()) < 45 * 24 * 60 * 60 * 1000 // 45 Tage
    );
    
    if (potentialDuplicates.length > 0) {
      return {
        triggered: true,
        severity: 'warning',
        message: `Mögliches Duplikat gefunden`,
        details: {
          duplicateCandidates: potentialDuplicates.map(d => ({
            id: d.id,
            invoiceNumber: d.invoiceNumber,
            periodStart: d.periodStart,
            amount: d.amount
          })),
          method: 'exact_match'
        }
      };
    }
    
    return { triggered: false };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 6: Missing Period (Gap)
// ─────────────────────────────────────────────────────────────────────────────

export const missingPeriodCheck: AnomalyCheck = {
  id: 'missing_period',
  name: 'Fehlende Periode',
  description: 'Erkennt Lücken in wiederkehrenden Kosten',
  applicableCostTypes: ['electricity', 'natural_gas', 'district_heating', 'water', 'telecom_mobile', 'telecom_landline'],
  
  async check(record, context): Promise<CheckResult> {
    const sameTypeRecords = context.historicalRecords
      .filter(r => r.costType === record.costType && r.supplierId === record.supplierId)
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
    
    if (sameTypeRecords.length === 0) {
      return { triggered: false };
    }
    
    const lastRecord = sameTypeRecords[0];
    const expectedNextStart = new Date(lastRecord.periodEnd);
    expectedNextStart.setDate(expectedNextStart.getDate() + 1);
    
    const gapDays = Math.floor(
      (record.periodStart.getTime() - expectedNextStart.getTime()) / (24 * 60 * 60 * 1000)
    );
    
    if (gapDays > 45) { // Mehr als 45 Tage Lücke
      return {
        triggered: true,
        severity: 'info',
        message: `${gapDays} Tage Lücke seit letzter Rechnung`,
        details: {
          lastPeriodEnd: lastRecord.periodEnd,
          currentPeriodStart: record.periodStart,
          gapDays,
          method: 'period_gap'
        }
      };
    }
    
    return { triggered: false };
  }
};
```

### 5.3 Alert-Beispiel im UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  🚨 KRITISCHE ANOMALIE ERKANNT                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                              │
│                                                                             │
│  Stromrechnung · Wien Energie · Standort Wien Hauptsitz                    │
│  Rechnungsnummer: 2024-0847391                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │   AKTUELL (Sep 2024)         VORJAHR (Sep 2023)                    │   │
│  │   ══════════════════         ══════════════════                    │   │
│  │                                                                     │   │
│  │   €71.340                    €47.120                               │   │
│  │   147.000 kWh                98.200 kWh                            │   │
│  │   0,485 €/kWh                0,480 €/kWh                           │   │
│  │                                                                     │   │
│  │   ┌──────────────────────────────────────────────────────────┐    │   │
│  │   │  ABWEICHUNG                                               │    │   │
│  │   │                                                           │    │   │
│  │   │  Betrag:     +€24.220  (+51,4%)  ████████████████████▓   │    │   │
│  │   │  Verbrauch:  +48.800 kWh (+49,7%)                        │    │   │
│  │   │  Preis/kWh:  +0,005 €/kWh (+1,0%)                        │    │   │
│  │   │                                                           │    │   │
│  │   └──────────────────────────────────────────────────────────┘    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  📊 ANALYSE                                                                │
│  ──────────                                                                │
│                                                                             │
│  • Verbrauch massiv gestiegen (+49,7%)                                     │
│  • Preis pro kWh nahezu stabil (+1,0%)                                     │
│  • Ursache liegt beim Verbrauch, nicht beim Preis                          │
│                                                                             │
│  💡 MÖGLICHE URSACHEN                                                      │
│  ────────────────────                                                      │
│                                                                             │
│  • Neuer Großverbraucher am Standort (Rechenzentrum, Kühlung?)            │
│  • Defektes Gerät mit Dauerbetrieb                                         │
│  • Zählerablesung/Schätzung fehlerhaft                                     │
│  • Nachzahlung aus Vorperioden enthalten?                                  │
│                                                                             │
│  📎 DOKUMENT                                                               │
│  ──────────                                                                │
│  [ 📄 Stromrechnung_WienEnergie_Sep2024.pdf ]                              │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐   │
│  │ ✓ Bestätigen   │  │ ✗ Ablehnen     │  │ 📝 Begründung hinzufügen  │   │
│  │   (korrekt)    │  │   (Fehler)     │  │                            │   │
│  └────────────────┘  └────────────────┘  └────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

