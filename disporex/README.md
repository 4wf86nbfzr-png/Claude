# DispoRex

Dispositions- und Personalmanagementplattform für Sicherheitsdienste, Ordnungsdienste,
Event-Personaldienstleister und vergleichbare Unternehmen. Mandantenfähig, API-first,
mit Dienstplanung, Rückmeldeprozess, Partnerverwaltung, Zeitnachweis-Abgleich,
Webhooks, Automatisierungen und austauschbarer KI-Anbindung.

Dieses Verzeichnis ist ein eigenständiges Projekt innerhalb des Repositories
(die Website im Wurzelverzeichnis bleibt unberührt).

## Stack

| Bereich        | Wahl                                                         |
| -------------- | ------------------------------------------------------------ |
| Frontend       | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend        | Next.js Route Handlers + Server Actions, Service-Schicht in `src/server` |
| Datenbank      | PostgreSQL 16, Drizzle ORM, versionierte SQL-Migrationen, Row-Level Security |
| Hintergrund    | Eigener Worker-Prozess mit Postgres-Jobtabelle (`FOR UPDATE SKIP LOCKED`) |
| Tests          | Vitest (Unit + Integration gegen echte Test-DB), Playwright (E2E) |
| Logging        | pino (JSON in Produktion, maskierte Geheimnisse)             |

Begründung und Details: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Schnellstart (lokal)

Voraussetzungen: Node.js ≥ 22, pnpm 10, PostgreSQL ≥ 14 (lokal oder per Docker).

```bash
cd disporex
pnpm install
cp .env.example .env                 # Werte anpassen (mind. APP_ENCRYPTION_KEY setzen)

# Rollen + Datenbanken anlegen (als PostgreSQL-Superuser), idempotent
sudo -u postgres bash scripts/db-setup.sh
# alternativ Docker:  docker compose up -d db   (legt Rollen beim ersten Start selbst an)

pnpm db:migrate                      # Migrationen inkl. RLS-Policies anwenden
pnpm db:seed                         # optional: gekennzeichnete synthetische Testdaten
pnpm dev                             # http://localhost:3000
pnpm worker                          # zweites Terminal: Hintergrundjobs (E-Mail, Webhooks, Erinnerungen)
```

Erster Benutzer: unter `/registrieren` ein Unternehmen anlegen. Der erste Benutzer
der Installation wird Systemadministrator. Alternativ `pnpm db:seed`: legt den Mandanten
„Demo Personaldienst (synthetisch)“ mit fünf Konten (`admin@disporex.example`, …) an und gibt
das Passwort aus; alle Daten sind erfunden.

## Betrieb mit Docker

```bash
cp .env.example .env && $EDITOR .env    # APP_ENCRYPTION_KEY, APP_URL, SMTP …
docker compose up -d --build            # db → migrate → web (Port 3000) + worker
```

Einzelheiten, Rollout, Health-Checks, Plattform-Varianten: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).
Sicherung und Wiederherstellung: [docs/BACKUP_RESTORE.md](./docs/BACKUP_RESTORE.md).

## Befehle

| Befehl                  | Zweck                                                     |
| ----------------------- | --------------------------------------------------------- |
| `pnpm dev`              | Entwicklungsserver                                        |
| `pnpm build && pnpm start` | Produktionsbuild und -start                            |
| `pnpm worker`           | Hintergrund-Worker                                        |
| `pnpm db:generate`      | Migration aus Schemaänderung erzeugen (`drizzle/`)        |
| `pnpm db:migrate`       | Migrationen anwenden (mit `DATABASE_URL`, Eigentümerrolle) |
| `pnpm db:seed`          | Synthetische Demodaten einspielen                         |
| `pnpm db:reset`         | Datenbank komplett zurücksetzen (nur mit `CONFIRM_RESET=yes`, nie in Produktion) |
| `pnpm test`             | Unit- und Integrationstests (setzt `disporex_test` zurück) |
| `pnpm check`            | Typprüfung + Lint + Tests (wie in der CI)                 |
| `pnpm test:e2e`         | Browser-Tests (startet eigenen Dev-Server auf Port 3100)  |
| `pnpm typecheck` / `pnpm lint` | Statische Prüfungen                                |
| `pnpm openapi`          | OpenAPI-Spezifikation nach `docs/openapi.json` exportieren |

## Umgebungsvariablen

Siehe `.env.example` (kommentiert). Wichtig:

- `DATABASE_URL` – Eigentümerrolle, nur für Migrationen.
- `DATABASE_APP_URL` – eingeschränkte Anwendungsrolle (`disporex_app`), unterliegt der Row-Level Security. In Produktion Pflicht.
- `APP_ENCRYPTION_KEY` – verschlüsselt gespeicherte Geheimnisse (Webhook-Secrets). In Produktion Pflicht.
- Ohne `SMTP_HOST` werden E-Mails nur protokolliert; ohne `AI_PROVIDER` bleibt KI deaktiviert; alles andere funktioniert weiter.

## Projektstruktur

```
src/app/              Seiten (App Router), Server Actions, API-Routen unter src/app/api/v1
src/server/core/      Env, Logger, Fehler, Krypto, Audit, Pagination, Rate-Limit
src/server/auth/      Sitzungen, Passwörter, API-Schlüssel, Berechtigungskatalog
src/server/db/        Drizzle-Schema (je Fachbereich eine Datei), Client mit Mandantenkontext, Migrate/Seed
src/server/modules/   Fachmodule (employees, customers, events, shifts, …) – Geschäftslogik
src/server/jobs/      Jobwarteschlange und Worker-Handler
src/components/       UI-Bausteine und Layout
tests/                unit / integration / e2e
drizzle/              SQL-Migrationen
docs/                 OpenAPI-Export, DEPLOYMENT.md, BACKUP_RESTORE.md
Dockerfile, docker-compose.yml   Container-Betrieb (Web, Worker, Migration, PostgreSQL)
```

CI: `.github/workflows/disporex-ci.yml` im Repository-Wurzelverzeichnis (Typen, Lint, Tests
gegen PostgreSQL, Build, Browser-Tests).

Weitere Dokumente: [PROJECT_STATUS.md](./PROJECT_STATUS.md) · [API.md](./API.md) ·
[SECURITY.md](./SECURITY.md) · [ROADMAP.md](./ROADMAP.md) · [CHANGELOG.md](./CHANGELOG.md)
