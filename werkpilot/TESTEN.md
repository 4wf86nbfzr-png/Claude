# Clairify lokal testen

Die Software besteht aus Website und Dashboard (Next.js), API und Worker (FastAPI) und einer
Postgres-Datenbank. Deshalb reicht keine einzelne HTML-Datei; alles läuft aber mit einem Befehl
per Docker auf dem eigenen Rechner.

## Voraussetzung

Docker Desktop (Windows, macOS) oder Docker Engine mit Compose (Linux): https://www.docker.com/products/docker-desktop/

## Starten

Im Ordner `werkpilot`:

| System | Befehl |
|---|---|
| macOS, Linux, Windows mit WSL oder Git Bash | `./start-test.sh` |
| Windows PowerShell | `.\start-test.ps1` |

Der erste Start baut die Container (einige Minuten). Danach stehen auf dem Bildschirm:

- Website: http://localhost:3000
- Dashboard: http://localhost:3000/anmelden
- Betreiberansicht: http://localhost:3000/admin
- API-Dokumentation: http://localhost:8000/docs
- Zugangsdaten des Beispielbetriebs „Elektro Brandt“ (sieben Anfragen, Termine, Angebote, Wochenbericht; das Konto ist zugleich Betreiber)

## Was Sie ausprobieren können

1. Anmelden, Übersicht, Anfragen: eine Anfrage öffnen, Entwurf freigeben, bearbeiten oder verwerfen.
2. Neue Anfrage erfassen (Knopf oben rechts) und zusehen, wie sie eingeordnet wird.
3. Termine eintragen und bestätigen, Angebote als angenommen markieren, Wochenbericht erzeugen.
4. Einstellungen: Geschäftszeiten, Signatur, Ton; Integrationen: Formular-Snippet erzeugen.
5. Betreiberansicht: Agenten, Freigaben, Finanzen, Leads, Not-Aus.
6. Website: Registrierung eines zweiten Betriebs; der Bestätigungslink steht im Log (`docker compose logs api`).

## Testbetrieb, bewusst ohne echte Anbieter

- Mails werden nicht verschickt, sondern protokolliert: `docker compose logs -f api`.
- Die KI arbeitet regelbasiert. Für echte Entwürfe in `.env` `LLM_PROVIDER=anthropic` (oder `openai`) und den Schlüssel setzen, dann `docker compose up -d`.
- Stripe, Google Kalender und Mail-Eingang sind nicht angebunden; wie das geht, steht in `docs/03-deployment.md` und `docs/07-integrationen.md`.

## Anhalten, zurücksetzen, aktualisieren

```
./start-test.sh stop      # anhalten, Daten bleiben
./start-test.sh reset     # alles löschen und frisch anlegen
git pull && ./start-test.sh
```

Unter Windows entsprechend `.\start-test.ps1 stop` und `.\start-test.ps1 reset`.
