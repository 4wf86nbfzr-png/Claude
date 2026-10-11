# Changelog

Alle wesentlichen Änderungen. Format angelehnt an „Keep a Changelog“.

## [Unreleased]

### Phase 1 – Grundlage (2026-10-11)
- Projektgerüst: Next.js 16, TypeScript, Tailwind 4, Drizzle ORM, PostgreSQL.
- Datenbankschema mit 44 mandantengebundenen Tabellen, Enums, Indizes, Fremdschlüsseln.
- Row-Level Security (`app_apply_rls()`), Rollen `disporex_owner`/`disporex_app`.
- Authentifizierung: Registrierung, Login mit Sperre, Passwort-Reset, Einladungen,
  Sitzungsverwaltung, Passwortbestätigung für sensible Aktionen.
- Rollen und Berechtigungskatalog mit mandantenspezifischen Overrides (UI-Matrix).
- API-Schlüssel (Scopes, Rotation, Widerruf), Route-Handler-Wrapper mit Request-ID,
  Rate-Limit, Idempotenz, einheitlichen Fehlern.
- Dashboard mit Kennzahlen aus Live-Daten, Benachrichtigungszentrale, Audit-Protokoll,
  Systemseite, Health-Endpunkt.
- Jobwarteschlange (Postgres) und Benachrichtigungsdienst (In-App + E-Mail-Job).
- Tests: Unit (Krypto, Rechte, Rate-Limit), Integration (Auth, Mandantentrennung),
  E2E (Registrierung, Login, Abmeldung).
