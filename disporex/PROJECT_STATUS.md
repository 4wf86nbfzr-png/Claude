# PROJECT_STATUS

Stand: 2026-10-11 · Projekt: **DispoRex** (vorläufiger Name) · Verzeichnis `disporex/` ·
Branch `claude/disporex-platform-development-b1dku4`

## Kurzfassung

Alle sieben Phasen des Umsetzungsplans sind implementiert und getestet. Die Anwendung
startet lokal, die Datenbank lässt sich per Skript oder Docker einrichten, Migrationen
laufen versioniert, Mandanten sind über Row-Level Security getrennt, Berechtigungen werden
serverseitig geprüft, die zentralen Module speichern und lesen echte Daten, Dienstplanung und
Konflikterkennung funktionieren, die API ist dokumentiert (OpenAPI) und getestet, Webhooks
sind signiert und SSRF-geschützt, Importe und Soll-Ist-Abgleich laufen, Fehlerzustände sind
nachvollziehbar, und die Betriebs-/Wiederherstellungsschritte sind dokumentiert.

**Das Produkt ist für einen Pilotbetrieb vorbereitet, nicht für eine öffentliche
SaaS-Veröffentlichung.** Was dafür fehlt, steht unten unter „Nicht umgesetzt / offen“.
Nichts in diesem Dokument ist eine rechtliche oder datenschutzrechtliche Bewertung.

## Projektziel

Mandantenfähige Dispositions- und Personalmanagementplattform für Sicherheits-/Ordnungsdienste
und Event-Personaldienstleister: Dienstplanung, Rückmeldeprozess, Partner, Zeitnachweis-Abgleich,
REST-API, Webhooks, Automatisierungen, austauschbare KI – zunächst für ein Unternehmen,
technisch als SaaS angelegt.

## Namensprüfung (nicht abgeschlossen – manuell nötig)

- Websuche nach „DispoRex“/„Disporex“: keine Software, kein Unternehmen, keine erkennbare Marke
  (Treffer waren Arzneimittel/Chemie mit ähnlichen Silben).
- Domain-Registerabfragen (RDAP .com/.de/.io/.app) und GitHub-Namensprüfung waren aus dieser
  Umgebung netzwerkseitig gesperrt. npm-Paketname `disporex` war frei.
- **Vor der Festlegung**: `whois`/DENIC für `disporex.de`/`.com`, DPMA- und EUIPO-Recherche
  (Nizza-Klassen 9, 35, 42), anwaltliche Freigabe. Eine Websuche ist keine Markenfreigabe.
- Alternativen, falls der Name scheitert: Shiftora, Dispono, Crewplan (ebenfalls ungeprüft).
  Der Name steht im Code nur in Anzeigetexten, `package.json` und Dateinamen der Doku.

## Architektur (Kurz)

Next.js 16 / React 19 / TypeScript · Service-Schicht `src/server/modules/*` (HTTP-unabhängig,
von Server Actions, Route Handlern und Worker gemeinsam genutzt) · PostgreSQL 16 mit Drizzle-
Migrationen und Row-Level Security (44 Tabellen, `FORCE`) · eigener Worker mit Postgres-Jobtabelle
und Outbox für Domain-Events · Vitest + Playwright. Details: ARCHITECTURE.md.

## Stand je Phase

| Phase | Inhalt | Status |
| ----- | ------ | ------ |
| 1 | Grundlage, Schema, RLS, Auth, Rollen, Designsystem, Dashboard, Protokoll, Jobs | fertig |
| 2 | Mitarbeiter, Qualifikationen, Kunden/Standorte/Kontakte, Anfragen, Veranstaltungen, Positionen, Schichten, Konflikte, Kalender, CSV-Im-/Export | fertig |
| 3 | Verfügbarkeiten, Rückmeldeprozess mit Fristen, Partner und Angebote, Dokumente, Benachrichtigungen, Portale, Worker | fertig |
| 4 | REST-API v1 + OpenAPI, API-Schlüssel, Webhooks, CSV/XLSX-Import, Soll-Ist-Abgleich, Korrekturen, Prüfberichte, Automatisierungsengine | fertig |
| 5 | KI-Anbieter (Anthropic, austauschbar), Extraktion/Entwürfe/Erklärungen mit Freigabe, E-Mail-Eingang (Webhook + IMAP) | fertig |
| 6 | Berichte, Abrechnungsvorbereitung (Sätze, Zuschläge, Positionen), globale Suche, Fehlerüberwachung | fertig |
| 7 | Seed, Deployment-Paket (Docker, Compose, CI), Backup/Restore-Doku, Sicherheitsprüfung, Szenarien-Abgleich | fertig (Eigenprüfung) |

## Implementierte Module (geprüft durch Tests und manuelle Durchsicht)

- **Mandanten/Benutzer/Rollen**: Registrierung, Login (Sperre, Rate-Limit), Passwort-Reset,
  Einladungen mit Rollen- und Fachbindung, Sitzungsübersicht/-widerruf, Mandantenwechsel,
  Rechte-Matrix mit Overrides, Passwortbestätigung für sensible Aktionen, API-Schlüssel.
- **Personal**: Profile mit Nummernkreis (MA-…), Status mit Aufbewahrungsfrist, Notizen,
  Qualifikationen mit Ablauf, Verfügbarkeiten/Abwesenheiten, CSV-Import/-Export.
- **Kunden**: Stammdaten, Ansprechpartner, Standorte, Ähnlichkeitsprüfung, Anfragen
  (Pflichtfeld-Kennzeichnung, Duplikaterkennung über Fingerabdruck/externalRef, Umwandlung in
  Veranstaltung + Auftrag + Positionen).
- **Planung**: Veranstaltungen (Status-Workflow, Änderungshistorie mit Begründung nach
  Bestätigung), Positionen mit Bedarf, Slots als Schichten (offen → angefragt → zugesagt →
  bestätigt; Absage/Rückzug/Fristablauf öffnen den Slot neu), Konflikte (Doppelbuchung und
  inaktiv hart; Qualifikation, Verfügbarkeit, Ruhezeit, Schichtdauer weich mit begründeter,
  protokollierter Freigabe), Vorschläge, Kalender, Aufträge.
- **Partner**: Profile, Qualifikationen, Positionsangebote mit Frist, Rückmeldung (voll/teilweise),
  Fremdpersonal in Slots, Partnerportal.
- **Dokumente**: Upload mit Typ-/Größen-/Magic-Bytes-Prüfung, Vertraulichkeit, Ablauf,
  einmalige Download-Links, Soft-Delete/Bereinigung, lokal oder S3.
- **Zeiten**: CSV/XLSX-Import mit Spaltenerkennung (DE/EN), Importkennung (IMP-…), Datei- und
  Zeilen-Duplikatschutz, Abgleich (Treffer/Abweichung/ungeplant/fehlend, Toleranz je Mandant),
  Korrekturen mit alt/neu/wer/wann/Begründung, Bestätigung/Ablehnung mit Rollenprüfung, CSV-Prüfbericht.
- **API v1** (32 Pfade, OpenAPI 3.1 unter `/api/v1/openapi.json`): Employees, Customers,
  CustomerRequests, Events/Positions, Shifts (assign/respond/confirm/withdraw), Availability,
  Partners/Offers, TimeRecords/Import, Reconciliation, Documents, Notifications, Webhooks,
  Inbound-E-Mail. Request-IDs, Idempotency-Keys, Rate-Limit, einheitliche Fehler.
- **Webhooks/Automatisierung**: signierte Zustellung mit Wiederholung, SSRF-Schutz, Regeln
  (Auslöser/Bedingungen/Aktionen) mit Laufprotokoll.
- **KI**: Anbieter-Schnittstelle, Anthropic-Implementierung mit strukturierten Ausgaben;
  Extraktion, Antwortentwurf, Abweichungserklärung, Dokumentzusammenfassung – immer als
  Vorschlag mit menschlicher Übernahme je Feld; Budget und Protokoll; ohne Anbieter ausgeblendet.
- **E-Mail-Eingang**: Webhook und IMAP-Abruf, Kundenzuordnung, Anfrageentwurf, Anhänge.
- **Berichte/Abrechnung/Suche**: 8 Berichte mit CSV, Stundensätze mit Gültigkeit, Zuschläge
  minutengenau, Abrechnungspositionen vorläufig/final, Suche mit Berechtigungsfilter.
- **Betrieb**: Health-Check, JSON-Logs mit Maskierung, Fehlerüberwachung (optional Sentry),
  Seed mit synthetischen Daten, Docker/Compose, CI, Backup-/Restore-Anleitung.

## Tests (alle ausgeführt am 2026-10-11)

| Befehl | Umfang | Ergebnis |
| ------ | ------ | -------- |
| `pnpm typecheck`, `pnpm lint` | TypeScript strikt, ESLint (Next) | ohne Befund |
| `pnpm test` | 62 Tests in 10 Dateien: Krypto/Rechte/Rate-Limit (Unit), Auth, Mandantentrennung, Planung, Worker/Webhooks/Automatisierung, Zeiten/Abgleich, API, KI/E-Mail, Berichte/Abrechnung/Suche, Seed | 62/62 bestanden |
| `pnpm test:e2e` | 8 Browser-Tests (Chromium): Registrierung, Login/Logout, Einladung + API-Schlüssel, Stammdaten, Veranstaltung/Besetzung mit Konflikt, Portal-Zusage, Dokumente | 8/8 bestanden |
| `pnpm build` | Produktionsbuild, Start und Header-Prüfung (CSP/HSTS) | erfolgreich |
| `pnpm audit --prod` | Abhängigkeiten | keine bekannten Schwachstellen |

### Pflichtszenarien → Tests

| # | Szenario | Test |
| - | -------- | ---- |
| 1 | Administrator legt Mitarbeiter an | `scheduling.test.ts` „Admin legt Mitarbeiter an …“; E2E `scheduling.spec.ts` Stammdaten |
| 2 | Disponent erstellt Veranstaltung | `scheduling.test.ts` „Position erzeugt offene Slots …“; E2E „Veranstaltung, Position, Besetzung“ |
| 3 | Position mit Personalbedarf | dieselben; `api.test.ts` „Planung über API“ |
| 4 | Mitarbeiter wird Schicht zugewiesen | `scheduling.test.ts` (Zuweisung, Zusage, Bestätigung); E2E |
| 5 | Doppelbuchungskonflikt erkannt | `scheduling.test.ts` „Doppelbuchung wird erkannt und ist nicht freigebbar“; API 409; E2E Konfliktanzeige |
| 6 | Kundenanfrage über API | `api.test.ts` „Szenario 6+7“ |
| 7 | Doppelte Anfrage erkannt | `api.test.ts` „Szenario 6+7“; `scheduling.test.ts` „… erkennt Duplikat und wandelt um“ |
| 8 | Zeitnachweis importiert | `time.test.ts` „importiert, ordnet zu …“, „liest XLSX“; API-Import |
| 9 | Abweichung korrekt angezeigt | `time.test.ts` (30 Minuten Abweichung, Toleranz, fehlender Nachweis) |
| 10 | Berechtigte Person bestätigt Korrektur | `time.test.ts` „Korrektur protokolliert … Rollen werden geprüft“ |
| 11 | Zugriff auf fremde Mandantendaten | `tenant-isolation.test.ts` (5 Tests, Service + SQL); `api.test.ts` „Szenario 11“; `reports-billing.test.ts` Suche |
| 12 | Unberechtigte API-Anfrage abgewiesen | `api.test.ts` „Szenario 12“ (401/403) |
| 13 | Fehlgeschlagene Benachrichtigung protokolliert | `worker.test.ts` „Szenario 13“ |

### Tests, die mangels externer Dienste nicht ausgeführt werden konnten

- Echter SMTP-Versand (Mailer im `log`-Kanal getestet, SMTP-Pfad nur per Code-Durchsicht).
- IMAP-Abruf gegen ein echtes Postfach (Parser und Verarbeitung sind mit Rohdaten getestet).
- Anthropic-API (Anbieter mit `FakeProvider` getestet; Anfrageaufbau nach SDK-Dokumentation).
- S3-Speicher (Signatur implementiert, kein Bucket verfügbar; lokaler Treiber getestet).
- Docker-Image-Build (kein Docker-Daemon; der Build-Befehl lief ohne `.env`/DB erfolgreich).
- WhatsApp-Kanal (nur Schnittstelle, kein Anbieter).

## Nicht umgesetzt / offen (ehrliche Liste)

1. **Rechtliche Prüfung**: Markenname, AV-Verträge, Datenschutzerklärung, Löschkonzept für
   Backups, Arbeitszeitrechtliche Bewertung der Warnungen – nicht Teil der Software.
2. **Hosting/Konten fehlen**: Deployment ist vorbereitet (Dockerfile, Compose, CI, Doku), aber
   nicht ausgeführt. SMTP, S3, Anthropic-Schlüssel, IMAP, Sentry sind Konfigurationsgrenzen.
3. **WhatsApp/SMS**: Kanal im Datenmodell und in den Präferenzen vorgesehen, kein Versand.
4. **PDF-Textextraktion** für KI-Zusammenfassungen fehlt (nur Textformate).
5. **CSP mit `'unsafe-inline'`** für Skripte; Nonce-Variante braucht Proxy/Middleware.
6. **Rate-Limiter prozesslokal**; bei mehreren Web-Instanzen gemeinsamen Speicher nachrüsten.
7. **Virenscan** für Uploads: Hook-Punkt, kein Scanner. **2FA** nicht vorhanden.
8. **KI-Modell-Fallback** (serverseitige `fallbacks`) nicht aktiviert; Fehler werden
   protokolliert und ergeben keinen Vorschlag. IMAP-Posteingang wird genau einem Mandanten
   zugeordnet (`IMAP_TENANT_ID`, sonst erster Mandant) – für Multi-Tenant-SaaS unzureichend.
9. **Mehrsprachigkeit** (nur Deutsch), **PWA** für Mitarbeiter, **SaaS-Abrechnung** der
   Mandanten selbst: Roadmap nach dem Pilot.
10. **Performance** ist für die Zielgröße (einige tausend Schichten/Monat) mit Indizes und
    Pagination ausgelegt; Lasttests wurden nicht durchgeführt.

## Bekannte Einschränkungen im Entwicklungsbetrieb

- Nach `next build` darf `next dev` nicht dasselbe `.next` nutzen (HMR-Schleife); E2E nutzt
  `.next-e2e`. `pnpm test` und `pnpm test:e2e` setzen `disporex_test` **vollständig zurück**.
- `pg`-Deprecation-Warnung in Tests (parallele Queries auf einem Client in einem Testhelfer);
  funktional ohne Auswirkung.

## Erforderliche externe Zugangsdaten (alle optional für den Kern)

| Dienst | Variablen | Ohne Konfiguration |
| ------ | --------- | ------------------ |
| SMTP | `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | E-Mails nur im Log; Einladungs-/Reset-Links erscheinen in der UI |
| IMAP | `IMAP_*` (+ `IMAP_TENANT_ID`) | kein Abruf; Webhook `/api/v1/inbound-email` nutzbar |
| KI | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL` | KI-Funktionen ausgeblendet |
| S3 | `STORAGE_DRIVER=s3`, `S3_*` | lokales Verzeichnis |
| WhatsApp | `WHATSAPP_*` | Kanal deaktiviert (kein Versand implementiert) |
| Sentry | `SENTRY_DSN` | nur Logs |
| Produktion | `APP_ENCRYPTION_KEY`, `DATABASE_APP_URL`, `APP_URL`, `SESSION_COOKIE_SECURE` | Start wird verweigert bzw. Cookies nicht `Secure` |

## Nächste Schritte (Vorschlag)

1. Pilot-Hosting einrichten (docs/DEPLOYMENT.md), Backup-Zeitplan, Wiederherstellung üben.
2. Echte SMTP-/IMAP-/KI-Zugänge in Staging testen; Ergebnisse hier nachtragen.
3. Namens- und Rechtsprüfung; danach Produktname endgültig setzen.
4. Nach ersten Pilot-Wochen: Nonce-CSP, 2FA, Virenscan, WhatsApp-Anbieter, PDF-Extraktion.
