# Changelog

Alle wesentlichen Änderungen. Format angelehnt an „Keep a Changelog“.

## [Unreleased]

### Phase 7 – Tests, Sicherheitsprüfung, Deployment-Paket (2026-10-11)
- Seed-Skript `pnpm db:seed` mit ausschließlich synthetischen Daten (Mandant „Demo Personaldienst
  (synthetisch)“, 5 Konten, 12 Mitarbeiter, 3 Kunden, 4 Veranstaltungen inkl. abgeschlossener mit
  Zeitnachweisen/Abgleich, Partnerangebot, Stundensätze, Zuschläge, Anfragen, Automatisierungsregeln);
  gesperrt in Produktion, überschreibt nie einen bestehenden Demo-Mandanten; Integrationstest.
- Deployment-Paket: `Dockerfile` (ein Image für Web, Worker, Migration, unprivilegierter Benutzer,
  Health-Check), `docker-compose.yml` (db → migrate → web + worker, Rollen-Init beim ersten Start),
  `.dockerignore`; `docs/DEPLOYMENT.md` (Umgebungen, Varianten, Rollout, Schutz produktiver Daten,
  verbleibende manuelle Schritte) und `docs/BACKUP_RESTORE.md` (Sicherung von DB, Dokumenten und
  Verschlüsselungsschlüssel, Wiederherstellung in Prüfinstanz, Übungsrhythmus).
- CI: `.github/workflows/disporex-ci.yml` – Typen, Lint, Unit/Integration gegen PostgreSQL 16,
  Produktionsbuild, Browser-Tests; kein Deployment.
- Sicherheit: Content-Security-Policy und HSTS im Produktionsbuild; `pnpm audit --prod` ohne
  bekannte Schwachstellen (transitive `uuid`-Version per Override angehoben); Eigenprüfung in
  SECURITY.md dokumentiert, offene Punkte benannt (Nonce-CSP, verteiltes Rate-Limit, Virenscan, 2FA).
- `instrumentation.ts` lädt die Fehlerüberwachung nur im Node-Runtime (kein Edge-Warnhinweis).
- Abgleich der 13 Pflichtszenarien mit den Tests in PROJECT_STATUS.md.
- Tests: 62 Unit/Integration, 8 Browser-Tests.

### Phase 6 – Auswertungen, Abrechnungsvorbereitung, Suche, Fehlerüberwachung (2026-10-11)
- Berichte: Besetzungsquote je Veranstaltung, Rückmeldequoten je Mitarbeiter, geleistete Stunden (geplant/erfasst/
  bestätigt), Abweichungen, Kundenübersicht, ablaufende Qualifikationen/Dokumente, Personalbedarf je Woche, Auftragsstatus.
  Alle Berichte mit Zeitraumfilter, CSV-Export und Kennzeichnung „vorläufig“, solange ein Abgleich noch offen ist.
- Abrechnungsvorbereitung: Stundensätze je Kunde/Position/Qualifikation mit Gültigkeitszeitraum (neue Sätze schließen
  Vorgänger tagesgenau ab, rückwirkende Änderungen bleiben ausgeschlossen), explizite Zuschlagsregeln (Nacht, Sonn-/
  Feiertag, Wochenende, Überstunden; minutengenau in der Mandanten-Zeitzone), Abrechnungspositionen aus bestätigten
  Nachweisen (sonst geplante Zeiten als „vorläufig“), Finalisierung nur mit bestätigten Minuten, CSV-Export. Keine
  Rechnungsstellung, keine Steuerlogik.
- Globale Suche über Mitarbeiter, Kunden, Veranstaltungen, Anfragen, Partner, Dokumente – nur, was die Rolle sehen darf.
- Fehlerüberwachung: `captureError` in API-Wrapper, Worker und `instrumentation.ts`; strukturiertes Log immer,
  Versand an einen Sentry-kompatiblen Endpunkt nur mit `SENTRY_DSN`, ohne Personendaten im Bericht.
- Tests: 61 Unit/Integration, 8 Browser-Tests.

### Phase 5 – KI und E-Mail-Eingang (2026-10-11)
- KI-Schnittstelle als austauschbarer Anbieter (`AiProvider`): Anthropic-Implementierung mit schema-validierten
  strukturierten Ausgaben, Refusal-/Fehlerbehandlung, Prompt-Injection-Schutz (Eingaben als gekennzeichnete Daten),
  Monats-Token-Budget je Mandant, Protokoll mit Tokens/Kosten/Dauer; Fake-Anbieter für Tests.
- Funktionen: Extraktion von Anfragedaten (nur Vorschlag; fachliche Plausibilisierung; Übernahme gezielt je Feld durch
  Menschen, protokolliert), Antwortentwürfe (nie automatischer Versand), Erklärung von Abweichungen, Zusammenfassung von
  Textdokumenten. Ohne Anbieter bleiben alle Funktionen ausgeblendet, der Rest läuft unverändert.
- E-Mail-Eingang: Webhook `POST /api/v1/inbound-email`, IMAP-Abruf im Worker (imapflow/mailparser), Deduplizierung über
  Message-ID, Kundenzuordnung (Adresse, Ansprechpartner, eindeutige Domain), Anfrageentwurf mit Rohtext, Anhänge als
  geprüfte Dokumente, Übersicht unter E-Mail-Eingang.
- Tests: 57 Unit/Integration, 8 Browser-Tests.

### Phase 4 – API, Import, Soll-Ist-Abgleich (2026-10-11)
- REST-API v1 vollständig: Employees, Customers, CustomerRequests, Events/Positions, Shifts (assign/respond/confirm/withdraw),
  Availability, Partners/PartnerOffers, TimeRecords (Import multipart/JSON), ReconciliationItems/-Reports, Documents,
  Notifications, Webhooks. OpenAPI 3.1 unter /api/v1/openapi.json und `pnpm openapi`.
- Zeitnachweise: CSV/XLSX-Parser mit Spaltenerkennung (deutsch/englisch), Importkennung, Datei- und Zeilen-Duplikatschutz,
  Zuordnung über Mitarbeiter-ID, automatischer Soll-Ist-Abgleich (Toleranz je Mandant), fehlende und ungeplante Nachweise,
  Korrekturen mit Protokoll (alt/neu/wer/wann/Begründung), Bestätigung/Ablehnung/Zurücksetzen, Prüfbericht als CSV,
  manuelle Nachweise.
- Rollen: Buchhaltung darf importieren; Einsatzleiter korrigieren, nicht bestätigen.
- Tests: 50 Unit/Integration (inkl. API-Tests), 8 Browser-Tests.

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
