## Teil 1: Problem & Markt

### 1.1 Der echte Pain (Real-World Case)

#### Cineplexx-Story

```
TIMELINE EINES VERMEIDBAREN SCHADENS

Monat 1:   Stromrechnung €47.000 ──────── ✓ Buchhaltung zahlt
Monat 2:   Stromrechnung €48.200 ──────── ✓ Buchhaltung zahlt (+2,5%)
Monat 3:   Stromrechnung €51.000 ──────── ✓ Buchhaltung zahlt (+5,8%)
Monat 4:   Stromrechnung €53.500 ──────── ✓ Buchhaltung zahlt (+4,9%)
Monat 5:   Stromrechnung €56.200 ──────── ✓ Buchhaltung zahlt (+5,0%)
...
Monat 11:  Stromrechnung €71.000 ──────── ✓ Buchhaltung zahlt
Monat 12:  Controller: "Moment mal..." ── 🚨 ZU SPÄT

Ergebnis:
├── Überzahlung: ~€80.000+
├── Sachverständiger: €15.000
├── Anwalt: €8.000
├── 6 Monate Diskussion mit Lieferant
├── Managementzeit: unbezahlbar
└── Ergebnis: Teilrückerstattung nach 18 Monaten

MIT COST WATCHDOG:

Monat 1:   €47.000 ──────── System lernt Baseline
Monat 2:   €48.200 ──────── +2,5% – noch im Rahmen
Monat 3:   €51.000 ──────── ⚠️ ALERT: +8,5% vs. Erwartung
                            
           → Sofortige Prüfung
           → Problem in Woche 3 erkannt
           → Schaden: €4.000 statt €80.000+
```

### 1.2 Warum das überall passiert

| Grund | Realität |
|-------|----------|
| **Niemand schaut hin** | Buchhaltung prüft ob Rechnung formal korrekt ist, nicht ob der Betrag plausibel ist |
| **Keine Vergleichswerte** | "Ist €51.000 viel?" – Ohne Kontext unmöglich zu sagen |
| **Daten in Silos** | Strom bei Facility, Gas bei Buchhaltung, Fuhrpark beim Flottenmanager |
| **Excel-Chaos** | Wer pflegt das? Wann wurde es zuletzt aktualisiert? |
| **Schleichende Erhöhungen** | 3% pro Monat fällt nicht auf – 40% nach einem Jahr schon |

### 1.3 Betroffene Kostenarten

| Kostenart | Typische Probleme | Schaden-Potenzial |
|-----------|-------------------|-------------------|
| **Strom** | Preiserhöhungen, falscher Tarif, Zählerablesung falsch | €10k-100k/Jahr |
| **Gas/Fernwärme** | Saisonale Anomalien nicht erkannt, Vertragskonditionen vergessen | €5k-50k/Jahr |
| **Wasser/Abwasser** | Lecks nicht bemerkt, falsche Zähler | €2k-20k/Jahr |
| **Telekommunikation** | Alte Verträge, ungenutzte Leitungen, Roaming | €5k-30k/Jahr |
| **Fuhrpark** | Tankbetrug, ineffiziente Fahrzeuge, Wartungskosten | €10k-50k/Jahr |
| **Miete/Nebenkosten** | Falsche Betriebskostenabrechnung, Index-Fehler | €5k-100k/Jahr |
| **IT/Cloud** | Ungenutzte Lizenzen, überdimensionierte Ressourcen | €10k-200k/Jahr |
| **Lieferanten** | Schleichende Preiserhöhungen, Mengenrabatte nicht angewendet | €20k-500k/Jahr |

### 1.4 Zielgruppe

#### Primär: Mittelstand mit wiederkehrenden Kosten >€500k/Jahr

| Segment | Beispiele | Warum relevant |
|---------|-----------|----------------|
| **Retail/Filialen** | Supermärkte, Apotheken, Modeketten | Viele Standorte, hohe Energiekosten |
| **Hospitality** | Hotels, Restaurants, Kinos | Energieintensiv, saisonale Schwankungen |
| **Produktion** | Fertigung, Lebensmittel, Handwerk | Hohe Energiekosten, viele Lieferanten |
| **Immobilien** | Hausverwaltungen, Facility Manager | Viele Objekte, komplexe Nebenkostenabrechnung |
| **Healthcare** | Kliniken, Pflegeheime, Arztpraxen | 24/7 Betrieb, regulierte Umgebung |
| **Logistik** | Speditionen, Lager | Fuhrpark, Energiekosten |

#### Buyer Persona: "Thomas – Der überarbeitete Controller"

```
Name:        Thomas Brunner
Rolle:       Leiter Controlling, 450 MA Produktionsbetrieb
Alter:       42

Situation:
├── Verantwortlich für Kostencontrolling
├── Bekommt monatlich 200+ Rechnungen
├── Hat keine Zeit jede einzeln zu prüfen
├── Excel-Listen sind veraltet
└── Chef fragt: "Warum sind die Energiekosten gestiegen?"

Pain:
├── "Ich erfahre von Problemen immer zu spät"
├── "Ich habe keinen Überblick über alle Standorte"
├── "Die Daten liegen in 10 verschiedenen Ordnern"
└── "Ich will nicht der sein der €100k übersehen hat"

Traum:
└── "Ich will einmal im Monat einen Report der mir sagt 
     wo ich hinschauen muss – und sonst meine Ruhe."
```

### 1.5 Marktgröße & Wettbewerb

#### Total Addressable Market (TAM)

| Region | Unternehmen >€500k wiederkehrende Kosten | Wert |
|--------|------------------------------------------|------|
| DACH | ~150.000 | €2-5 Mrd/Jahr (an übersehenen Kosten) |
| EU | ~1.000.000 | €15-30 Mrd/Jahr |

#### Wettbewerb

| Kategorie | Player | Schwäche |
|-----------|--------|----------|
| **Spend Analytics** | Coupa, SAP Ariba | Enterprise (€100k+/Jahr), keine Anomalie-Detection |
| **Energy Management** | Schneider, Siemens | Hardware-fokussiert, teuer, keine PDF-Verarbeitung |
| **Carbon Accounting** | Persefoni, Watershed | Nur CO₂, keine Kostenanalyse |
| **Expense Management** | Spendesk, Pleo | Nur Reisekosten/Kreditkarten |
| **Excel** | Microsoft | Manuell, fehleranfällig, kein Alerting |

**Die Lücke:** Niemand automatisiert "PDF-Rechnung → Trend-Analyse → Alert wenn anomal" für den Mittelstand.

### 1.6 Positionierung

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MARKTPOSITIONIERUNG                                 │
│                                                                             │
│                              Enterprise                                     │
│                                  ▲                                          │
│                                  │                                          │
│                    ┌─────────────┴─────────────┐                           │
│                    │  SAP Ariba    Coupa       │                           │
│                    │  (€100k+/Jahr)            │                           │
│                    └───────────────────────────┘                           │
│                                                                             │
│   Manuell ◄────────────────────┼────────────────────► Automatisiert        │
│                                │                                            │
│                    ┌───────────┴───────────┐                               │
│                    │                       │                               │
│                    │    COST WATCHDOG      │                               │
│                    │    ═══════════════    │                               │
│                    │    €149-899/Monat     │                               │
│                    │    Mittelstand-Fokus  │                               │
│                    │                       │                               │
│                    └───────────────────────┘                               │
│                                │                                            │
│                    ┌───────────┴───────────┐                               │
│                    │  Excel + Praktikant   │                               │
│                    │  (fehleranfällig)     │                               │
│                    └───────────────────────┘                               │
│                                  │                                          │
│                                  ▼                                          │
│                             Mittelstand                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Teil 2: Produktvision & Roadmap

### 2.1 Produktvision

> Eine Plattform die **alle wiederkehrenden Kosten** eines Unternehmens automatisiert erfasst, analysiert und überwacht – und sofort Alarm schlägt wenn etwas nicht stimmt.

### 2.2 Kern-Wertversprechen

| Für wen | Was | Warum wichtig |
|---------|-----|---------------|
| **Controller** | Automatische Anomalie-Erkennung | Kein manuelles Durchforsten von Rechnungen |
| **CFO** | Kostentrends auf einen Blick | Fundierte Entscheidungen |
| **Facility Manager** | Standort-Vergleich | Ineffiziente Standorte identifizieren |
| **Einkauf** | Lieferanten-Performance | Preiserhöhungen nicht übersehen |
| **Geschäftsführung** | ROI in Wochen | Tool zahlt sich selbst |

### 2.3 Release-Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RELEASE ROADMAP                                   │
│                                                                             │
│  V1.0 PAINKILLER          V2.0 INTELLIGENCE       V3.0 PLATFORM            │
│  ────────────────         ─────────────────       ─────────────            │
│  Q2 2026                  Q4 2026                 Q2 2027                  │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐    ┌─────────────────┐        │
│  │ Core Engine     │     │ + Smart         │    │ + Ecosystem     │        │
│  │ ─────────────   │     │ ─────────────   │    │ ─────────────   │        │
│  │ • PDF Extraction│     │ • Forecast      │    │ • ESG Modul     │        │
│  │ • Excel/CSV     │     │ • Szenario-Plan │    │ • White-Label   │        │
│  │ • Manual Entry  │     │ • Benchmarking  │    │ • Connector SDK │        │
│  │ • Anomaly Detect│     │ • Smart Alerts  │    │ • Marketplace   │        │
│  │ • Trend-Analyse │     │ • IoT Connect   │    │ • Partner API   │        │
│  │ • Dashboard     │     │ • Fuhrpark      │    │ • ERP-Connect   │        │
│  │ • Alerts        │     │ • Empfehlungen  │    │                 │        │
│  │ • Multi-Tenant  │     │                 │    │                 │        │
│  │ • API + SSO     │     │                 │    │                 │        │
│  └─────────────────┘     └─────────────────┘    └─────────────────┘        │
│          │                       │                      │                  │
│          └───────────────────────┴──────────────────────┘                  │
│                    MODULARE ARCHITEKTUR                                    │
│                    Gleiche Basis, neue Module                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Feature-Matrix nach Version

| Feature | V1.0 | V2.0 | V3.0 |
|---------|------|------|------|
| **Data Ingestion** ||||
| PDF-Extraktion (Energie, Telekom, etc.) | ✅ | ✅ | ✅ |
| Excel/CSV Import | ✅ | ✅ | ✅ |
| Manuelle Eingabe + Beleg-Upload | ✅ | ✅ | ✅ |
| API für externe Systeme | ✅ | ✅ | ✅ |
| E-Mail-Inbox (Rechnungen automatisch) | ❌ | ✅ | ✅ |
| IoT-Connectors (Smart Meter, Sensoren) | ❌ | ✅ | ✅ |
| Fuhrpark-Integration (DKV, Shell, Leasing) | ❌ | ✅ | ✅ |
| ERP-Connectors (SAP B1, DATEV, BMD) | ❌ | ❌ | ✅ |
| Connector SDK (eigene bauen) | ❌ | ❌ | ✅ |
| **Analyse & Detection** ||||
| Trend-Analyse (MoM, YoY) | ✅ | ✅ | ✅ |
| Anomalie-Erkennung (statistisch) | ✅ | ✅ | ✅ |
| Preis-pro-Einheit Tracking | ✅ | ✅ | ✅ |
| Standort-Vergleich | ✅ | ✅ | ✅ |
| Lieferanten-Vergleich | ✅ | ✅ | ✅ |
| Lücken-Erkennung | ✅ | ✅ | ✅ |
| Duplikat-Erkennung | ✅ | ✅ | ✅ |
| Forecast (linear, saisonal) | ❌ | ✅ | ✅ |
| Szenario-Planung | ❌ | ✅ | ✅ |
| Branchen-Benchmarking | ❌ | ❌ | ✅ |
| KI-Empfehlungen | ❌ | ✅ | ✅ |
| **Alerting** ||||
| E-Mail Alerts | ✅ | ✅ | ✅ |
| Dashboard Notifications | ✅ | ✅ | ✅ |
| Slack/Teams Integration | ❌ | ✅ | ✅ |
| Eskalations-Regeln | ❌ | ✅ | ✅ |
| Custom Alert Rules | ❌ | ✅ | ✅ |
| **Reporting** ||||
| Dashboard (KPIs, Trends) | ✅ | ✅ | ✅ |
| Excel-Export | ✅ | ✅ | ✅ |
| PDF-Report (Monatlich) | ✅ | ✅ | ✅ |
| Standort-Reports | ✅ | ✅ | ✅ |
| Lieferanten-Reports | ✅ | ✅ | ✅ |
| Scheduled Reports | ❌ | ✅ | ✅ |
| Custom Dashboards | ❌ | ❌ | ✅ |
| **Module (Add-Ons)** ||||
| ESG/CO₂-Modul | ❌ | ✅ | ✅ |
| Vertrags-Management | ❌ | ❌ | ✅ |
| Budget-Planung | ❌ | ✅ | ✅ |
| **Platform** ||||
| Multi-Tenant | ✅ | ✅ | ✅ |
| SSO (SAML/OIDC) | ✅ | ✅ | ✅ |
| Role-Based Access Control | ✅ | ✅ | ✅ |
| REST API | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ |
| Audit-Log | ✅ | ✅ | ✅ |
| White-Label | ❌ | ❌ | ✅ |

### 2.5 ESG-Modul (V2.0+)

Das ESG-Modul nutzt dieselben Energiedaten und erweitert sie um CO₂-Berechnung:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COST WATCHDOG + ESG MODUL                           │
│                                                                             │
│   Energie-Rechnungen (PDF)                                                  │
│           │                                                                 │
│           ▼                                                                 │
│   ┌───────────────────────────────────────────────────────────────────┐    │
│   │                      CORE ENGINE                                   │    │
│   │   • Extraktion (Verbrauch kWh/m³ + Kosten €)                      │    │
│   │   • Normalisierung                                                 │    │
│   │   • Validierung                                                    │    │
│   └───────────────────────────────────────────────────────────────────┘    │
│           │                                                                 │
│           ├─────────────────────────┬──────────────────────────────────┐   │
│           ▼                         ▼                                  │   │
│   ┌───────────────┐         ┌───────────────┐                         │   │
│   │ COST ENGINE   │         │ ESG ENGINE    │  ← Modul (Add-On)       │   │
│   │ ────────────  │         │ ────────────  │                         │   │
│   │ • €/Einheit   │         │ • CO₂/Einheit │                         │   │
│   │ • Trends      │         │ • Scope 1+2   │                         │   │
│   │ • Anomalien   │         │ • ESRS E1     │                         │   │
│   │ • Alerts      │         │ • Audit-Trail │                         │   │
│   └───────────────┘         └───────────────┘                         │   │
│           │                         │                                  │   │
│           ▼                         ▼                                  │   │
│   ┌───────────────┐         ┌───────────────┐                         │   │
│   │ "Du zahlst    │         │ "Dein CO₂-    │                         │   │
│   │  zu viel!"    │         │  Fußabdruck"  │                         │   │
│   └───────────────┘         └───────────────┘                         │   │
│                                                                             │
│   Verkauft sich selbst          Upsell für CSRD-Pflichtige                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

