## Teil 6: API Design

### 6.1 API-Struktur

```
/api/v1
├── /auth
│   ├── POST   /login
│   ├── POST   /logout
│   ├── POST   /refresh
│   ├── GET    /me
│   └── POST   /sso/callback
│
├── /organizations
│   ├── GET    /                      # Liste
│   ├── POST   /                      # Erstellen
│   ├── GET    /:id                   # Details
│   ├── PUT    /:id                   # Aktualisieren
│   └── DELETE /:id                   # Löschen
│
├── /locations
│   ├── GET    /                      # Liste (mit Filter)
│   ├── POST   /                      # Erstellen
│   ├── GET    /:id                   # Details
│   ├── PUT    /:id                   # Aktualisieren
│   ├── DELETE /:id                   # Löschen
│   └── GET    /:id/costs             # Kosten am Standort
│
├── /suppliers
│   ├── GET    /                      # Liste
│   ├── POST   /                      # Erstellen
│   ├── GET    /:id                   # Details
│   ├── PUT    /:id                   # Aktualisieren
│   └── GET    /:id/costs             # Kosten dieses Lieferanten
│
├── /documents
│   ├── GET    /                      # Liste
│   ├── POST   /upload                # Hochladen
│   ├── GET    /:id                   # Details + Metadaten
│   ├── GET    /:id/download          # Original herunterladen
│   ├── POST   /:id/extract           # Extraktion triggern
│   ├── POST   /:id/verify            # Verifizieren
│   └── GET    /:id/costs             # Extrahierte Kosten
│
├── /costs
│   ├── GET    /                      # Liste (mit Filter)
│   ├── POST   /                      # Manuell erstellen
│   ├── GET    /:id                   # Details
│   ├── PUT    /:id                   # Aktualisieren
│   ├── DELETE /:id                   # Löschen
│   ├── POST   /:id/verify            # Verifizieren
│   └── GET    /:id/anomalies         # Anomalien für diesen Record
│
├── /anomalies
│   ├── GET    /                      # Liste (mit Filter)
│   ├── GET    /:id                   # Details
│   ├── POST   /:id/acknowledge       # Bestätigen
│   └── POST   /:id/resolve           # Als gelöst markieren
│
├── /alerts
│   ├── GET    /                      # Liste
│   └── GET    /:id                   # Details
│
├── /analytics
│   ├── GET    /dashboard             # Dashboard-Daten
│   ├── GET    /trends                # Kostentrends
│   ├── GET    /by-location           # Kosten pro Standort
│   ├── GET    /by-supplier           # Kosten pro Lieferant
│   ├── GET    /by-cost-type          # Kosten pro Kategorie
│   └── GET    /price-per-unit        # Preis/Einheit Trends
│
├── /reports
│   ├── POST   /monthly               # Monatsbericht generieren
│   ├── POST   /excel                 # Excel-Export
│   ├── POST   /pdf                   # PDF-Report
│   └── GET    /:id/download          # Report herunterladen
│
├── /settings
│   ├── GET    /                      # Tenant-Einstellungen
│   ├── PUT    /                      # Einstellungen aktualisieren
│   ├── GET    /thresholds            # Alert-Schwellwerte
│   └── PUT    /thresholds            # Schwellwerte anpassen
│
├── /users
│   ├── GET    /                      # User-Liste
│   ├── POST   /                      # User erstellen
│   ├── GET    /:id                   # User-Details
│   ├── PUT    /:id                   # User aktualisieren
│   └── DELETE /:id                   # User löschen
│
├── /webhooks
│   ├── GET    /                      # Webhook-Liste
│   ├── POST   /                      # Webhook erstellen
│   ├── DELETE /:id                   # Webhook löschen
│   └── POST   /:id/test              # Webhook testen
│
└── /audit
    ├── GET    /logs                  # Audit-Logs (mit Filter)
    └── GET    /entity/:type/:id      # Logs für bestimmte Entity
```

### 6.2 Beispiel-Response: Dashboard

```typescript
// GET /api/v1/analytics/dashboard?period=2024

{
  "period": {
    "year": 2024,
    "month": null,  // Ganzjahr
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  },
  
  "summary": {
    "totalCosts": 1847320.45,
    "currency": "EUR",
    "recordCount": 1247,
    "locationCount": 12,
    "supplierCount": 34
  },
  
  "comparison": {
    "previousPeriod": {
      "year": 2023,
      "totalCosts": 1623450.20,
      "change": {
        "absolute": 223870.25,
        "percent": 13.8
      }
    }
  },
  
  "byCostType": [
    {
      "costType": "electricity",
      "label": "Strom",
      "totalCosts": 523400.00,
      "percentage": 28.3,
      "trend": {
        "direction": "up",
        "percent": 8.2
      }
    },
    {
      "costType": "natural_gas",
      "label": "Erdgas",
      "totalCosts": 312800.00,
      "percentage": 16.9,
      "trend": {
        "direction": "down",
        "percent": -12.4
      }
    },
    // ...
  ],
  
  "byLocation": [
    {
      "locationId": "loc_abc123",
      "locationName": "Wien Hauptsitz",
      "totalCosts": 487200.00,
      "percentage": 26.4,
      "costPerSqm": 42.50,
      "trend": {
        "direction": "up",
        "percent": 15.2
      }
    },
    // ...
  ],
  
  "byMonth": [
    { "month": "2024-01", "totalCosts": 142500.00 },
    { "month": "2024-02", "totalCosts": 138200.00 },
    { "month": "2024-03", "totalCosts": 145800.00 },
    // ...
  ],
  
  "anomalies": {
    "total": 23,
    "bySeverity": {
      "critical": 3,
      "warning": 12,
      "info": 8
    },
    "unacknowledged": 7,
    "potentialSavings": 34500.00  // Geschätzt
  },
  
  "topAnomalies": [
    {
      "id": "anom_xyz789",
      "costRecordId": "cost_abc123",
      "type": "yoy_deviation",
      "severity": "critical",
      "message": "+51,4% vs. Vorjahresmonat",
      "amount": 71340.00,
      "deviationAbsolute": 24220.00,
      "location": "Wien Hauptsitz",
      "supplier": "Wien Energie",
      "costType": "electricity",
      "detectedAt": "2024-10-05T08:23:15Z"
    },
    // ...
  ],
  
  "dataQuality": {
    "totalRecords": 1247,
    "verified": 1180,
    "pending": 45,
    "withWarnings": 22,
    "verificationRate": 94.6
  }
}
```

---

