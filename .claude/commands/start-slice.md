# Start Slice

Starte die Arbeit an einem Slice.

## Anweisungen

1. Lies `docs/slices/slice-$ARGUMENTS.md` komplett durch
2. Lies `docs/tech-leitplanken.md` für kritische Patterns (RLS, Outbox, Idempotenz)
3. Erstelle einen Plan für die Implementierung
4. Frage mich ob der Plan so passt bevor du Code schreibst

## Wichtige Regeln

- IMMER `SET LOCAL app.current_tenant` in Transactions
- IMMER Outbox-Events statt direktes Redis-Publish
- IMMER TypeScript strict mode
- IMMER Tests parallel zum Code schreiben
- NIEMALS RLS umgehen

## Workflow

1. Lies die Slice-Dokumentation
2. "Think harder": Erstelle einen detaillierten Plan
3. Warte auf mein OK
4. Implementiere Schritt für Schritt
5. Nach jedem größeren Schritt: Commit
