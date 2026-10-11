# Deployment und Betrieb

Diese Anleitung beschreibt, wie DispoRex in Entwicklung, Test und Produktion betrieben wird.
Sie setzt keinen bestimmten Hoster voraus. Was ohne Hosting-Konto nicht automatisiert werden
kann, ist am Ende unter „Verbleibende manuelle Schritte“ aufgeführt.

## Umgebungen

| Umgebung | `APP_ENV` | Datenbank | Besonderheiten |
| -------- | --------- | --------- | -------------- |
| Entwicklung | `development` | `disporex` (lokal) | `pnpm dev`, E-Mails nur im Log, KI aus |
| Test | `test` | `disporex_test` | wird von `pnpm test` / `pnpm test:e2e` **bei jedem Lauf zurückgesetzt** |
| Staging | `staging` | eigene Instanz | wie Produktion, aber mit Testkonten und ohne echte Kundendaten |
| Produktion | `production` | eigene Instanz | `APP_ENCRYPTION_KEY` und `DATABASE_APP_URL` Pflicht, sonst startet die App nicht |

Regeln:
- Jede Umgebung hat eigene Zugangsdaten. Produktive Zugangsdaten gehören nie in Test oder CI.
- `pnpm db:reset` und `pnpm db:seed` verweigern den Lauf, wenn `APP_ENV`/`NODE_ENV` auf
  `production` stehen. `db:reset` braucht zusätzlich `CONFIRM_RESET=yes`.
- Migrationen (`pnpm db:migrate`) sind additiv und versioniert (`drizzle/*.sql`, Journal in
  `drizzle/meta`). Drizzle führt jede Datei genau einmal aus und protokolliert das in der
  Tabelle `drizzle.__drizzle_migrations`.

## Prozesse

| Prozess | Befehl | Zweck |
| ------- | ------ | ----- |
| Web | `pnpm start` (nach `pnpm build`) | UI, Server Actions, REST-API, Health-Check |
| Worker | `pnpm worker` | E-Mail-Zustellung, Webhooks, Automatisierungen, Fristen, Erinnerungen, IMAP-Abruf, Aufbewahrung |
| Migration | `pnpm db:migrate` | einmalig vor jedem Rollout, mit der **Eigentümer**-Verbindung (`DATABASE_URL`) |

Web und Worker benutzen zur Laufzeit `DATABASE_APP_URL` (Rolle `disporex_app`, Row-Level
Security greift). `DATABASE_URL` (Eigentümer) wird nur für Migrationen gebraucht. Der Worker
darf mehrfach laufen (Jobs werden mit `FOR UPDATE SKIP LOCKED` verteilt).

## Variante A: Docker Compose (ein Server)

```bash
cd disporex
cp .env.example .env            # mindestens APP_ENCRYPTION_KEY, APP_URL, SMTP_* eintragen
openssl rand -base64 48         # -> APP_ENCRYPTION_KEY
docker compose up -d --build    # db -> migrate -> web + worker
docker compose logs -f web worker
```

- Die Datenbank-Rollen werden beim **ersten** Start des leeren Volumes über
  `scripts/db-setup.sh` angelegt. Passwörter kommen aus `DISPOREX_OWNER_PASSWORD` und
  `DISPOREX_APP_PASSWORD` (Standardwerte nur für lokale Tests – in Produktion setzen).
- Compose setzt `DATABASE_URL`/`DATABASE_APP_URL` selbst auf den Container `db`; alle anderen
  Werte kommen aus `.env`.
- Dokumente liegen im Volume `storage` (oder bei `STORAGE_DRIVER=s3` im Objektspeicher).
- Die Datenbank ist nur auf `127.0.0.1:5432` gebunden.
- Vor DispoRex gehört ein TLS-terminierender Reverse-Proxy (Caddy, nginx, Traefik), der
  `X-Forwarded-Proto` setzt. Beispiel Caddy:

```
dispo.example.de {
  reverse_proxy 127.0.0.1:3000
}
```

Rollout einer neuen Version:

```bash
git pull
docker compose build
docker compose run --rm migrate      # Migrationen zuerst, additiv
docker compose up -d web worker      # dann die Prozesse neu starten
curl -fsS https://dispo.example.de/api/health
```

## Variante B: Plattform mit Node-Prozessen (Render, Fly.io, Hetzner, eigene VM)

1. PostgreSQL 14+ bereitstellen, `scripts/db-setup.sh` als Superuser ausführen (Passwörter über
   Umgebungsvariablen setzen), oder die beiden Rollen gleichwertig von Hand anlegen.
   Wichtig: `disporex_app` **ohne** `BYPASSRLS`.
2. Umgebungsvariablen aus `.env.example` in der Plattform hinterlegen (Secrets-Store, nicht im
   Repository).
3. Build: `pnpm install --frozen-lockfile && pnpm build`.
4. Release-Schritt: `pnpm db:migrate`.
5. Zwei Prozesse: `pnpm start` (Web, Port aus `PORT`) und `pnpm worker`.
6. Health-Check der Plattform auf `GET /api/health` (200 = ok, 503 = Datenbank nicht erreichbar).

## Variante C: Container-Image einzeln

```bash
docker build -t disporex:$(git rev-parse --short HEAD) .
docker run --rm --env-file .env disporex:… pnpm db:migrate
docker run -d --env-file .env -p 3000:3000 -v disporex-storage:/data/storage disporex:…
docker run -d --env-file .env -v disporex-storage:/data/storage disporex:… pnpm worker
```

Das Image läuft als unprivilegierter Benutzer, enthält kein `.env`, und sein Health-Check
ruft `/api/health` auf. Die Docker-Dateien wurden in dieser Umgebung **nicht** gebaut
(kein Docker-Daemon verfügbar); der enthaltene Build-Befehl `pnpm build` wurde ohne `.env` und
ohne Datenbank erfolgreich ausgeführt, was dem Build im Image entspricht.

## Konfiguration, die vor dem Produktivstart gesetzt sein muss

| Variable | Pflicht | Hinweis |
| -------- | ------- | ------- |
| `APP_ENV=production`, `NODE_ENV=production` | ja | aktiviert CSP/HSTS, sperrt Reset/Seed |
| `APP_URL` | ja | öffentliche https-Adresse (Links in E-Mails, Einladungen) |
| `APP_ENCRYPTION_KEY` | ja | ≥ 32 Zeichen; verschlüsselt Webhook-Secrets. **Verlust = gespeicherte Secrets unlesbar** (siehe Backup) |
| `DATABASE_URL` / `DATABASE_APP_URL` | ja | Eigentümer- und Anwendungsrolle |
| `SESSION_COOKIE_SECURE=true` | ja | nur über https |
| `SMTP_*`, `MAIL_FROM` | empfohlen | sonst werden E-Mails nur protokolliert (Einladungslinks erscheinen in der UI) |
| `STORAGE_DRIVER=s3` + `S3_*` | optional | sonst lokales Verzeichnis, das gesichert werden muss |
| `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | optional | ohne: KI-Funktionen ausgeblendet |
| `IMAP_*` | optional | Abruf eingehender Anfragen; ohne: Modul inaktiv, Webhook `/api/v1/inbound-email` bleibt nutzbar |
| `SENTRY_DSN` | optional | Fehler zusätzlich an Sentry-kompatiblen Dienst |
| `LOG_LEVEL=info` | – | JSON-Logs auf stdout; Geheimnisse werden maskiert |

## Health, Logs, Fehler

- `GET /api/health` → `{ status, db, latencyMs, time }`; 503 bei Datenbankfehler.
- Logs: pino-JSON auf stdout (`requestId`, `tenantId`, `userId`, keine Token/Passwörter).
  Mit einem Log-Sammler (Loki, CloudWatch, …) nach `level` und `requestId` filtern.
- Jede API-Antwort trägt `X-Request-Id`; Fehlermeldungen enthalten denselben Wert.
- Fehlgeschlagene Jobs: Einstellungen → System (Jobs, Dead-Letter) und Einstellungen →
  Zustellung (fehlgeschlagene Benachrichtigungen). Webhook-Zustellungen je Endpunkt.
- `captureError` meldet unbehandelte Fehler aus API, Worker und Server Components; mit
  `SENTRY_DSN` zusätzlich an den Dienst (ohne Personendaten).

## Schutz produktiver Daten beim Deployment

- Kein Build- oder Startschritt löscht Daten. Nur `pnpm db:reset` löscht (gesperrt in Produktion).
- Migrationen werden nie automatisch beim App-Start ausgeführt, sondern als eigener,
  nachvollziehbarer Schritt mit der Eigentümerrolle.
- Vor jeder Migration ein Backup (siehe `BACKUP_RESTORE.md`). Migrationen, die Spalten löschen
  oder umbenennen, erst nach einem Release ausrollen, in dem der Code die Spalte nicht mehr liest.
- Aufbewahrungs-/Löschjobs des Workers markieren nur; endgültiges Löschen bestätigt eine Person.

## CI

`.github/workflows/disporex-ci.yml` (im Repository-Wurzelverzeichnis) führt bei jedem Push
mit Änderungen unter `disporex/` aus: Typprüfung, Lint, Unit-/Integrationstests gegen eine
PostgreSQL-16-Instanz, Produktionsbuild und Browser-Tests. Es wird nichts deployt.

## Verbleibende manuelle Schritte (brauchen Konten oder Entscheidungen)

1. Hosting wählen und Secrets dort hinterlegen (kein Hosting-Konto in dieser Umgebung).
2. Domain + TLS (Reverse-Proxy), `APP_URL` und `SESSION_COOKIE_SECURE=true` setzen.
3. SMTP-Zugang für Transaktionsmails; SPF/DKIM für die Absenderdomain.
4. Optional: S3-Bucket, Anthropic-API-Schlüssel, IMAP-Postfach, Sentry-Projekt.
5. Backup-Zeitplan einrichten und eine Wiederherstellung einmal **tatsächlich durchspielen**.
6. Für einen Container-Rollout das Image einmal in einer Umgebung mit Docker bauen und starten.
