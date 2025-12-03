# Review Code

Führe ein Code-Review gegen die Spezifikation durch.

## Anweisungen

1. Lies die relevanten Spec-Dateien in `docs/`
2. Vergleiche den aktuellen Code mit der Spezifikation
3. Prüfe insbesondere:

### Kritische Checks

- [ ] **RLS**: Wird `SET LOCAL app.current_tenant` in JEDER Transaction gesetzt?
- [ ] **Outbox**: Werden Events in der gleichen Transaction wie Business-Logik geschrieben?
- [ ] **Idempotenz**: Haben Jobs eine eindeutige Job-ID? Gibt es Unique Constraints?
- [ ] **TypeScript**: Keine `any` Types? Alle Funktionen getypt?
- [ ] **Validation**: Werden alle Inputs validiert?

### Code-Qualität

- [ ] Keine duplizierten Code-Blöcke
- [ ] Konsistente Fehlerbehandlung
- [ ] Klare Namensgebung
- [ ] Kommentare wo nötig

### Tests

- [ ] RLS-Tests vorhanden?
- [ ] Business-Logic Tests vorhanden?
- [ ] Edge Cases getestet?

## Output

Gib mir eine Liste von:
1. **Kritische Issues** (müssen gefixt werden)
2. **Warnings** (sollten gefixt werden)
3. **Suggestions** (optional)

Für jedes Issue: Datei, Zeile, Problem, Lösung.
