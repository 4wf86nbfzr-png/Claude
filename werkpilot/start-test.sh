#!/usr/bin/env bash
# Startet Clairify komplett lokal zum Testen (Website, Dashboard, API, Datenbank, Worker) und legt
# einen Beispielbetrieb mit Zugangsdaten an. Voraussetzung: Docker Desktop (oder Docker Engine + Compose).
#   ./start-test.sh            starten (oder neu starten)
#   ./start-test.sh stop       anhalten (Daten bleiben)
#   ./start-test.sh reset      alles löschen und frisch starten
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then echo "Docker fehlt. Bitte Docker Desktop installieren: https://www.docker.com/products/docker-desktop/"; exit 1; fi
if ! docker compose version >/dev/null 2>&1; then echo "Docker Compose fehlt (ist in Docker Desktop enthalten)."; exit 1; fi

case "${1:-start}" in
  stop)  docker compose stop; echo "Angehalten. Wieder starten mit ./start-test.sh"; exit 0 ;;
  reset) docker compose down -v; rm -f .env; echo "Zurückgesetzt."; ;;
esac

# .env mit sicheren Testwerten anlegen (keine echten Anbieter: Mails werden nur protokolliert, KI regelbasiert)
if [ ! -f .env ]; then
  cp .env.example .env
  secret=$(python3 -c 'import secrets;print(secrets.token_hex(32))' 2>/dev/null || openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | cut -c1-64)
  sed -i.bak -e "s|^SECRET_KEY=.*|SECRET_KEY=$secret|" -e 's|^EMAIL_FROM=.*|EMAIL_FROM="Clairify <noreply@example.com>"|' -e 's|^COOKIE_SECURE=.*|COOKIE_SECURE=false|' .env && rm -f .env.bak
  echo ".env für den Testbetrieb angelegt."
fi

echo "Baue und starte die Dienste (beim ersten Mal einige Minuten) ..."
docker compose up -d --build

printf "Warte auf die API "
for i in $(seq 1 120); do
  if curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; then echo " bereit."; break; fi
  printf "."; sleep 2
  if [ "$i" = 120 ]; then echo; echo "API antwortet nicht. Logs: docker compose logs api"; exit 1; fi
done
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1 && break; sleep 2; done

echo "Lege Beispielbetrieb an ..."
seed=$(docker compose exec -T api python scripts/demo_seed.py) || { echo "Beispieldaten konnten nicht angelegt werden. Logs: docker compose logs api"; exit 1; }
email=$(echo "$seed" | sed -n 's/.*"email": "\([^"]*\)".*/\1/p'); pw=$(echo "$seed" | sed -n 's/.*"password": "\([^"]*\)".*/\1/p')
docker compose exec -T api python scripts/make_operator.py "$email" >/dev/null 2>&1 || true

cat <<INFO

==========================================================
  Clairify läuft lokal.

  Website:     http://localhost:3000
  Dashboard:   http://localhost:3000/anmelden
  Betreiber:   http://localhost:3000/admin
  API:         http://localhost:8000/docs

  Zugang (Beispielbetrieb "Elektro Brandt", auch Betreiber):
  E-Mail:      $email
  Passwort:    $pw

  Hinweise: Mails werden nur protokolliert (docker compose logs api),
  die KI arbeitet regelbasiert, bis in .env ein Anbieter steht.
  Anhalten: ./start-test.sh stop   Zurücksetzen: ./start-test.sh reset
==========================================================
INFO
