# WerkPilot AI

KI-gestützte Anfrage- und Terminorganisation für kleine Handwerksbetriebe in Deutschland.
SaaS mit Testphase und drei Tarifen (Starter 79 €, Business 149 €, Pro 249 €), gebaut für
weitgehend autonomen Betrieb: Agenten für Betrieb, Geschäftsleitung, Produkt, Support,
Marketing, Vertrieb und Finanzen laufen im Hintergrund und legen alles Kritische zur Freigabe vor.

> Stand: funktionsfähiges Kernprodukt, lokal getestet (69 Backend-Tests, Frontend-Build, `./test-all.sh` mit 35 Prüfungen inkl. Smoke- und
> Browser-Durchlauf). **Noch nicht produktiv.** Was vor dem Start fehlt, steht in
> [docs/09-produktivstart-checkliste.md](docs/09-produktivstart-checkliste.md) und
> [docs/08-offene-punkte.md](docs/08-offene-punkte.md).

## Was das System tut

| Für den Handwerksbetrieb (Kunde) | Für den Betreiber (Sie) |
|---|---|
| Anfragen aus E-Mail-Weiterleitung, Website-Formular und manueller Erfassung an einem Ort | Betreiberansicht `/admin`: Systemzustand, Not-Aus, Budgets, Freigaben |
| KI-Klassifizierung (Kategorie, Dringlichkeit, Zusammenfassung, fehlende Angaben) | Sieben Agenten mit Protokoll, Kostenlimit und Laufzeitgrenze |
| Antwortentwürfe mit Freigabe; optional automatische Eingangsbestätigung (ab Business) | Stripe-Abrechnung über Webhooks, Tarife in der Datenbank änderbar |
| Terminvorschläge aus Geschäftszeiten (+ Google Kalender), Bestätigung per Kundenlink, Angebotsnachverfolgung | Täglicher Betriebsbericht, Finanzübersicht, Fehler- und Jobwarteschlange |
| Wochenbericht, Kundenübersicht, Nutzer/Rollen, Export, Löschung | Audit-Protokoll aller automatischen Aktionen |

Was die KI **nicht** tut: Preise nennen, Diagnosen stellen, verbindliche Zusagen machen.
Unsichere Fälle werden zur menschlichen Prüfung markiert.

## Struktur

```
werkpilot/
  backend/            FastAPI (Python 3.13), SQLAlchemy 2 async, Alembic, Postgres
    app/core/         Konfiguration, DB, Sicherheit, Rate-Limit, Not-Aus, Audit
    app/models/       Datenmodell (Mandanten, Anfragen, Abos, Jobs, Agenten …)
    app/services/     Fachlogik: Anfrage-Pipeline, LLM-Gateway, E-Mail, Billing, Kalender, Jobs
    app/agents/       ops, director, product_dev, support, marketing, sales, finance
    app/api/          REST-Endpunkte (auth, tenant, inquiries, billing, integrations, public, support, admin)
    app/workers/      Worker-Prozess: Jobwarteschlange + Zeitplan
    alembic/          Migrationen
    scripts/          backup.sh, restore.sh, make_operator.py
    tests/            pytest-Suite (Auth, Rechte, Pipeline, Billing, Jobs, Agenten, Sicherheit, E2E, Recovery)
  frontend/           Next.js 16, TypeScript, Tailwind 4 – Website, Dashboard (/app), Betreiber (/admin)
    src/components/landing/   Filmische Startseite: Hintergrundvideo, Scrollytelling (GSAP ScrollTrigger),
                              3D-Szene (three.js / React Three Fiber, WebXR-Knopf bei VR/AR-Geräten),
                              horizontale Scroll-Sektion, Fade-ins, eingebettete Demo
    public/video/             Hintergrundvideo clairify-{2160,1080,720}.{webm,mp4}, Poster, Standbilder,
                              palette.json und SOURCES.md (Quellen und Lizenzen); erzeugt aus tools/video/
    tools/video/              footage.json (Clipliste mit Quellen), prepare-footage.mjs (Schnitt, Varianten,
                              Poster, Standbilder, Farbpalette), palette.py, anim.html + render.mjs (Platzhalter)
    tools/preview/            Erzeugt landing-preview.html: die Startseite als Einzeldatei zum Testen ohne Server
                              (node tools/preview/build.mjs im Frontend-Ordner)
  docs/               Marktvalidierung, Architektur, Deployment, Betrieb, Kosten, Recht, Integrationen, offene Punkte
  docker-compose.yml  db, redis, api, worker, backup, web
  .env.example        alle Konfigurationswerte mit Erklärung
```

## Schnellstart (lokal, ohne Docker)

Voraussetzungen: Python ≥ 3.12, Node 22, PostgreSQL 16 (läuft lokal auf 5432).

```bash
# 1. Datenbank
sudo -u postgres psql -c "CREATE USER werkpilot WITH PASSWORD 'werkpilot' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE werkpilot OWNER werkpilot;"
sudo -u postgres psql -c "CREATE DATABASE werkpilot_test OWNER werkpilot;"

# 2. Backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example .env            # Werte anpassen; für lokal reichen die Standardwerte
alembic upgrade head
uvicorn app.main:app --reload --port 8000        # API: http://localhost:8000/api/docs
python -m app.workers.runner                      # zweites Terminal: Worker (Jobs + Agenten)

# 3. Frontend
cd ../frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev     # http://localhost:3000
```

Registrieren Sie sich über die Website. Ohne E-Mail-Anbieter steht der Bestätigungslink
im Backend-Log (Zeile `email.simulated`). Betreiberrechte vergeben:

```bash
cd backend && python scripts/make_operator.py ihre@adresse.de
```

Danach ist `/admin` erreichbar.

## Schnellstart mit Docker Compose

```bash
cp .env.example .env     # mindestens SECRET_KEY, ENCRYPTION_KEY, POSTGRES_PASSWORD setzen
docker compose up -d --build
docker compose exec api python scripts/make_operator.py ihre@adresse.de
```

Web: http://localhost:3000 · API: http://localhost:8000 · Backups: Volume `backups`.

## Tests

**Alles auf einmal** (empfohlen vor jedem Commit und vor dem Deploy):

```bash
./test-all.sh                 # Backend: Lint, 69 Tests, Migration gegen leere DB, pip-audit
                              # Frontend: ESLint, Build, npm audit
                              # Smoke: API + Web starten, 21 Seiten/Endpunkte, API-Kundenreise, Worker-Lauf
                              # Browser: Playwright-Durchlauf Demo → Registrierung → Bestätigung → Login → Anfrage → Versand
./test-all.sh --quick         # nur Lint, Tests, Build (ca. 2 Minuten)
./test-all.sh --no-browser    # alles außer Playwright
```

Voraussetzungen: laufendes Postgres (`TEST_DATABASE_URL`, Standard `werkpilot_test`), Node 22, Python ≥ 3.12.
Für den Browser-Teil installiert das Skript Playwright in `.pw/`; ein vorhandenes Chromium kann
über `PLAYWRIGHT_CHROMIUM=/pfad/zu/chromium` genutzt werden. Details landen in `.test-all.log`.

Einzeln:

```bash
cd backend && pytest -q                 # nutzt werkpilot_test (TEST_DATABASE_URL überschreibbar)
ruff check app tests && ruff format --check app tests
cd ../frontend && npm run lint && npm run build
```

Die Suite deckt ab: Registrierung/Bestätigung/Login/Refresh/Sperre, Mandantentrennung und
Rollen, Anfrage-Pipeline inkl. Spam, Injection, Kontingente, Terminvorschläge, Angebotsnachfass,
Wochenbericht, Stripe-Webhooks (Signatur, Idempotenz, Lebenszyklus), Tarifverwaltung,
Feature-Gating, Jobwarteschlange mit Backoff und Fehlerwarteschlange, Not-Aus, alle Agenten,
öffentliche Endpunkte (Formular, Inbound-Mail, Demo, Rate-Limit), Sicherheits-Header,
Verschlüsselung, Budgetgrenzen, Export/Löschung/Aufbewahrung, ausgehende Webhooks,
die komplette Kundenreise und Backup/Wiederherstellung mit den echten Skripten.

## Konfiguration

Alles über Umgebungsvariablen, dokumentiert in [`.env.example`](.env.example).
Drei Anbieter sind austauschbar: KI (`LLM_PROVIDER=mock|anthropic|openai`),
E-Mail (`EMAIL_PROVIDER=console|resend|smtp`), Zahlungen (Stripe).
`mock` und `console` sind **keine** Produktionswerte: sie liefern regelbasierte Entwürfe
bzw. protokollieren E-Mails nur. Das Dashboard zeigt diesen Zustand offen an.

## Dokumentation

| Datei | Inhalt |
|---|---|
| [docs/01-marktvalidierung.md](docs/01-marktvalidierung.md) | Zielgruppe, Wettbewerb, Untergruppe, Angebot, Kosten-/Umsatzplan, zu prüfende Annahmen |
| [docs/02-architektur.md](docs/02-architektur.md) | Entscheidungen, Datenmodell, Pipeline, Agenten, Sicherheitskonzept |
| [docs/03-deployment.md](docs/03-deployment.md) | Hosting-Varianten, externe Konten, benötigte Zugangsdaten, Schritt-für-Schritt |
| [docs/04-betrieb.md](docs/04-betrieb.md) | Betriebshandbuch: Überwachung, Not-Aus, Backups, Störungen, Agenten-Zeitplan |
| [docs/05-kosten.md](docs/05-kosten.md) | Laufende Kosten je Anbieter und Szenario |
| [docs/06-rechtliches.md](docs/06-rechtliches.md) | Rechtliche Prüfungen: DSGVO, AVV, TDDDG, Impressum, AGB, KI |
| [docs/07-integrationen.md](docs/07-integrationen.md) | Formular-Snippet, Inbound-Mail-Adapter, Google OAuth, Stripe, CRM-Webhook |
| [docs/08-offene-punkte.md](docs/08-offene-punkte.md) | Bekannte Lücken und Risiken |
| [docs/09-produktivstart-checkliste.md](docs/09-produktivstart-checkliste.md) | Einmalige Einrichtung und laufende Überwachung |
