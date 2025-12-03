# Slice 4: Multi-User + RBAC

> **Wochen:** 11-12  
> **Ziel:** "Mehrere User mit verschiedenen Rollen"

## Deliverable

- User Management UI
- Rollen: admin, manager, analyst, viewer, auditor
- Permissions pro Rolle
- User kann nur seine erlaubten Standorte sehen
- Audit-Log für alle Änderungen

## Rollen

| Rolle | Permissions |
|-------|-------------|
| admin | Alles |
| manager | CRUD auf Kosten, Anomalien, Reports |
| analyst | Read auf alles, Write auf Anomalien |
| viewer | Read-only |
| auditor | Read auf alles inkl. Audit-Log |

## Definition of Done

- [ ] User CRUD API
- [ ] User Management UI
- [ ] Rollen werden enforced
- [ ] Audit-Log schreibt alle Änderungen
