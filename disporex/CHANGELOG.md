# Changelog

Alle wesentlichen Änderungen. Format angelehnt an „Keep a Changelog“.

## [Unreleased]

### Phase 3 – Rückmeldungen, Partner, Dokumente, Worker (2026-10-11)
- Verfügbarkeiten/Abwesenheiten (Disposition und Mitarbeiterportal), Konflikt bei Zuweisung.
- Mitarbeiterportal: Einsatzanfragen mit Frist, Zu-/Absage, Einsatzdetails, Abwesenheiten, freigegebene Dokumente.
- Partner: Profile, Ansprechpartner, Qualifikationen, Positionsangebote mit Frist, Rückmeldung (voll/teilweise/Absage),
  Belegung offener Slots als Fremdpersonal, Partnerportal mit eingeschränkter Sicht.
- Kundenportal: eigene Anfragen, freigegebene Aufträge und Dokumente.
- Dokumente: Upload mit Typ-/Größen-/Magic-Bytes-Prüfung, Versionen, Vertraulichkeitsstufen, Ablaufdaten, einmalige
  zeitlich begrenzte Download-Links, Soft-Delete mit späterer Bereinigung; Speicher lokal oder S3 (SigV4, ohne SDK).
- Worker-Prozess: E-Mail-Zustellung mit Wiederholung und Fehlerprotokoll, Domain-Event-Verteilung, Wartungslauf
  (Fristablauf, Erinnerungen, ablaufende Dokumente/Qualifikationen, Löschfristen).
- Webhooks (Signatur, Zeitstempel, Wiederholung, SSRF-Schutz, Deaktivierung nach Dauerfehlern) und
  Automatisierungsengine (Trigger/Bedingungen/Aktionen, Protokoll, Stundenlimit, Schleifenschutz) inkl. Einstellungsseiten.
- Übersicht fehlgeschlagener Zustellungen. Rollenabhängige Startseite.

### Phase 2 – Stammdaten und Planung (2026-10-11)
- Mitarbeiter, Qualifikationen, Kunden, Kundenanfragen, Veranstaltungen, Positionen, Aufträge, Schichten,
  Konflikterkennung, Kalender, Schichtexport, Events-API.

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
