# PROJECT_STATUS

Stand: 2026-10-11 · Projekt: **DispoRex** (vorläufiger Name) · Verzeichnis `disporex/`

## Projektziel

Vollständige, mandantenfähige Dispositions- und Personalmanagementplattform für
Sicherheits-/Ordnungsdienste und Event-Personaldienstleister mit Dienstplanung,
Rückmeldeprozess, Partnern, Zeitnachweis-Abgleich, REST-API, Webhooks,
Automatisierungen und austauschbarer KI – als Produkt, später SaaS.

## Namensprüfung (vorläufiges Ergebnis)

- Websuche nach „DispoRex“/„Disporex“ ergab keine Software, kein Unternehmen und keine
  erkennbare Marke mit diesem Namen (Treffer waren Arzneimittel/Chemie mit ähnlichen Silben).
- Domain-Registerabfragen (RDAP für .com/.de/.io/.app) sind aus dieser Umgebung
  netzwerkseitig gesperrt → **manuell prüfen** (z. B. `whois disporex.de`, DENIC, ICANN Lookup).
- Benutzernamen: npm-Paket/Org `disporex` frei; GitHub nicht prüfbar (API gesperrt).
- **Offen vor Festlegung:** DPMA-/EUIPO-Markenrecherche (Nizza-Klassen 9, 35, 42),
  anwaltliche Freigabe. Eine Websuche ist keine rechtliche Markenfreigabe.
- Alternativen, falls DispoRex scheitert: **Shiftora**, **Dispono**, **Crewplan**
  (kurz, international, ebenfalls ungeprüft).

## Gewählte Architektur

Next.js 16 / React 19 / TypeScript · Service-Schicht in `src/server` · PostgreSQL 16 mit
Drizzle-Migrationen und Row-Level Security · eigener Worker mit Postgres-Jobtabelle ·
Vitest + Playwright. Details in ARCHITECTURE.md.

## Aktueller Entwicklungsstand

| Phase | Status | Bemerkung |
| ----- | ------ | --------- |
| 1 Grundlage | **fertig** | Schema, RLS, Auth, Rollen, Designsystem, Dashboard, Protokoll, Jobs |
| 2 Stammdaten & Planung | in Arbeit | — |
| 3–7 | offen | siehe ROADMAP.md |

## Implementierte Module (geprüft)

- **Mandanten/Benutzer/Rollen**: Registrierung, Login (Sperre, Rate-Limit), Logout,
  Passwort-Reset, Einladungen mit Rollen- und Fachbindung, Sitzungsübersicht und -widerruf,
  Mandantenwechsel, Rollen-Rechte-Matrix mit Overrides, Passwortbestätigung für sensible Aktionen.
- **Mandantentrennung**: RLS auf 44 Tabellen, `withTenant`/`withSystem`-Transaktionskontext,
  Tests, die fremde IDs lesen/schreiben/ändern/löschen wollen und scheitern.
- **API-Grundgerüst**: `apiHandler` (Request-ID, Bearer/Cookie-Auth, Scopes, Rate-Limit,
  Idempotenz-Keys), API-Schlüsselverwaltung (UI), `GET /api/health`.
- **Dashboard**: 12 Kennzahlen aus Live-Abfragen, Tagesliste, Warnungen, Benachrichtigungen.
- **Benachrichtigungen**: In-App mit Dedupe-Key, E-Mail als Hintergrundjob, Präferenzen.
- **Audit-Protokoll** mit Suche und Pagination; **System-Seite** mit Integrationsstatus und Jobs.
- **Design-System**: Tokens, Tabellen, Formulare, Badges, Kennzahlen, Navigation.

## Noch offene Aufgaben (nächste Schritte)

1. Phase 2: Mitarbeiter, Qualifikationen, Kunden/Standorte/Ansprechpartner,
   Kundenanfragen, Veranstaltungen, Positionen, Schichten mit Konfliktprüfung, Kalender,
   Import/Export Mitarbeiter, Events-API (für E2E-Test „API-Schlüssel“).
2. Worker-Prozess (`src/worker.ts`) mit Handlern (E-Mail-Zustellung, Fristen).
3. Seed-Skript mit gekennzeichneten synthetischen Daten.

## Bekannte Fehler / Einschränkungen

- Kein Worker-Prozess gestartet → E-Mail-Benachrichtigungen bleiben `pending` (Handler folgt).
- Rate-Limiter ist prozesslokal.
- Nach `next build` muss `.next` vor `next dev` gelöscht werden, sonst HMR-Reload-Schleife
  (Next 16.4-Verhalten; im Playwright-Setup berücksichtigt).

## Aktuell ausführbare Tests

| Befehl | Umfang | Ergebnis (2026-10-11) |
| ------ | ------ | --------------------- |
| `pnpm test` | 21 Tests: Krypto, Rechte, Rate-Limit, Auth-Abläufe, Mandantentrennung | 21/21 bestanden |
| `pnpm test:e2e -g "Registrierung\|Abmelden"` | Registrierung → Dashboard, Login-Fehler, Abmeldung, Schutz von /dashboard | 2/2 bestanden |
| `pnpm test:e2e` (vollständig) | enthält API-Schlüssel-Test gegen `/api/v1/events` | **noch nicht lauffähig** (Endpunkt folgt in Phase 2) |
| `pnpm build` | Produktionsbuild | erfolgreich |

## Erforderliche externe Zugangsdaten (alle optional für den Betrieb des Kerns)

| Dienst | Variablen | Zweck | Ohne Konfiguration |
| ------ | --------- | ----- | ------------------ |
| SMTP | `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | E-Mails (Einladung, Reset, Benachrichtigungen) | E-Mails werden protokolliert, Links erscheinen in der UI |
| IMAP | `IMAP_*` | Eingehende Kundenanfragen | Modul inaktiv (Phase 5) |
| KI | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | Extraktion/Entwürfe | KI-Funktionen ausgeblendet (Phase 5) |
| S3 | `S3_*` | Dokumentenspeicher | lokales Dateisystem (`storage/`) |
| WhatsApp | `WHATSAPP_*` | Messaging | Kanal deaktiviert |
| Sentry | `SENTRY_DSN` | Fehlerüberwachung | nur Logs |
| Produktion | `APP_ENCRYPTION_KEY`, `DATABASE_APP_URL` | Pflicht | Start wird verweigert |
