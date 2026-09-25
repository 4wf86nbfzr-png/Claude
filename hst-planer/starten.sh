#!/usr/bin/env bash
#
# HST Planer auf dem eigenen Rechner starten — ein Aufruf.
#
#   ./starten.sh              mit Docker (empfohlen, bringt die Datenbank mit)
#   ./starten.sh --ohne-docker  mit einem PostgreSQL, das schon läuft
#   ./starten.sh --stoppen     wieder anhalten
#   ./starten.sh --loeschen    anhalten und Datenbank samt Ablage wegwerfen
#
# Beim ersten Mal legt das Skript eine .env an und würfelt die Geheimnisse
# selbst aus. Sie landen NUR in dieser Datei und nie im Quellcode.
set -euo pipefail
cd "$(dirname "$0")"

BLAU=$'\033[36m'; GRUEN=$'\033[32m'; ROT=$'\033[31m'; AUS=$'\033[0m'
sagen()   { printf '%s==>%s %s\n' "$BLAU" "$AUS" "$*"; }
gut()     { printf '%s ok %s %s\n' "$GRUEN" "$AUS" "$*"; }
abbruch() { printf '%sFehler:%s %s\n' "$ROT" "$AUS" "$*" >&2; exit 1; }

MODUS="docker"
for arg in "$@"; do
  case "$arg" in
    --ohne-docker) MODUS="lokal" ;;
    --stoppen)     MODUS="stoppen" ;;
    --loeschen)    MODUS="loeschen" ;;
    -h|--hilfe)    awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    *) abbruch "Unbekannt: $arg  (--hilfe zeigt die Möglichkeiten)" ;;
  esac
done

# Ein Geheimnis erzeugen. openssl ist auf macOS und Linux da; ohne es tut es
# auch /dev/urandom — nur soll das Skript nicht daran scheitern.
#
# Die beiden Sonderzeichen aus base64 werden ersetzt: das Datenbankpasswort
# steht mitten in der DATABASE_URL, und ein "/" darin beendet dort den
# Rechnernamen. Das fiele bei jedem zweiten ersten Start an — und wäre eine
# Stunde Suche wert, weil die Meldung von allem redet, nur nicht davon.
geheimnis() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 "${1:-48}" | tr -d '\n=' | tr '+/' '-_' ;
  else head -c "${1:-48}" /dev/urandom | base64 | tr -d '\n=' | tr '+/' '-_' ; fi
}

eintragen() { # eintragen SCHLUESSEL WERT
  local schluessel="$1" wert="$2"
  if grep -qE "^${schluessel}=" .env; then
    # Trennzeichen | statt / — in base64 kommen Schrägstriche vor.
    sed -i.sicherung -E "s|^${schluessel}=.*|${schluessel}=\"${wert}\"|" .env && rm -f .env.sicherung
  else
    printf '%s="%s"\n' "$schluessel" "$wert" >> .env
  fi
}

umgebungAnlegen() {
  if [ -f .env ]; then gut ".env ist vorhanden — bleibt unangetastet."; return; fi
  [ -f .env.example ] || abbruch "Weder .env noch .env.example gefunden. Stehen Sie im Ordner hst-planer?"
  sagen "Lege .env an und erzeuge die Geheimnisse …"
  cp .env.example .env
  DB_PASSWORT="$(geheimnis 18)"
  eintragen AUTH_SECRET          "$(geheimnis 48)"
  eintragen DATA_ENCRYPTION_KEY  "$(geheimnis 32)"
  eintragen API_SECRET           "$(geheimnis 32)"
  eintragen POSTGRES_USER        "hst"
  eintragen POSTGRES_PASSWORD    "$DB_PASSWORT"
  eintragen POSTGRES_DB          "hstplaner"
  if [ "$MODUS" = "docker" ]; then
    # In Compose heißt der Datenbankrechner "datenbank", nicht localhost.
    eintragen DATABASE_URL "postgresql://hst:${DB_PASSWORT}@datenbank:5432/hstplaner?schema=public"
  else
    eintragen DATABASE_URL "postgresql://hst:${DB_PASSWORT}@localhost:5432/hstplaner?schema=public"
  fi
  gut ".env angelegt. Die Geheimnisse stehen nur dort."
}

zugaengeZeigen() {
  local adresse="$1"
  cat <<HINWEIS

  ${GRUEN}Der Planer läuft:${AUS} ${adresse}

  Zum Anmelden (Startpasswort für alle: Hafencity!2026):

    admin@hermserviceteam.com           Superadministration — sieht alles
    gf@hermserviceteam.com              Geschäftsführung
    dispo@hermserviceteam.com           Disposition / Leitstelle
    personal@hermserviceteam.com        Personalbüro
    einsatzleitung@hermserviceteam.com  Einsatzleitung
    teamleitung@hermserviceteam.com     Teamleitung
    max.mustermann@example.org          Mitarbeiter (Mitarbeiter-App)
    kunde@hafenlicht-demo.de            Kunde
    partner@elbwacht-demo.de            Subunternehmer

  Beim ersten Anmelden verlangt die Anwendung ein eigenes Passwort —
  das Startpasswort kennen zu viele. Das ist Absicht, kein Fehler.

  Zum Ausprobieren liegt ein Stundenzettel bereit:
    beispiele/stundenzettel-beispiel.xlsx  →  "Abgleiche" → "Neuer Abgleich"

  Anhalten: ./starten.sh --stoppen

HINWEIS
}

# --------------------------------------------------------------- Docker

mitDocker() {
  command -v docker >/dev/null 2>&1 || abbruch "Docker ist nicht installiert. Entweder Docker Desktop einrichten — oder: ./starten.sh --ohne-docker"
  docker info >/dev/null 2>&1 || abbruch "Docker ist installiert, läuft aber nicht. Docker Desktop starten und noch einmal versuchen."

  umgebungAnlegen
  sagen "Baue das Abbild und starte Datenbank und Anwendung (beim ersten Mal dauert das ein paar Minuten) …"
  docker compose up -d --build

  sagen "Spiele die Migrationen ein …"
  docker compose run --rm werkzeuge npx prisma migrate deploy

  # Seed nur beim ersten Mal: er legt Beispieldaten an, und die sollen bei
  # einem zweiten Start nicht ein zweites Mal entstehen.
  if [ ! -f .seed-gelaufen ]; then
    sagen "Lege Beispieldaten an …"
    docker compose run --rm werkzeuge npm run seed
    date -u +%Y-%m-%dT%H:%M:%SZ > .seed-gelaufen
  else
    gut "Beispieldaten sind schon da (löschen mit ./starten.sh --loeschen)."
  fi

  local port; port="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\"' || true)"
  zugaengeZeigen "http://localhost:${port:-3000}"
}

# ---------------------------------------------------------------- Lokal

ohneDocker() {
  command -v node >/dev/null 2>&1 || abbruch "Node.js fehlt. Nötig ist Version 20 oder neuer: https://nodejs.org"
  local version; version="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$version" -ge 20 ] || abbruch "Node.js $version ist zu alt — nötig ist 20 oder neuer."

  umgebungAnlegen
  if [ ! -d node_modules ]; then
    sagen "Installiere die Pakete …"
    npm ci
  fi

  sagen "Starte — Datenbank, Migrationen und Build macht das Startskript selbst."
  # Die Beispieldaten müssen einmal von Hand angestoßen werden: ohne Docker
  # kann das Skript nicht wissen, ob die Datenbank schon jemandem gehört.
  if [ ! -f .seed-gelaufen ]; then
    printf '\n  Beispieldaten sind noch nicht angelegt. Wenn die Datenbank leer ist:\n    npm run seed\n\n'
  fi
  local port; port="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\"' || true)"
  zugaengeZeigen "http://localhost:${port:-3000}"
  npm start
}

# ------------------------------------------------------------ Anhalten

stoppen() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker compose down
    gut "Angehalten. Datenbank und Dateiablage bleiben erhalten."
  else
    echo "Ohne Docker: den laufenden Prozess mit Strg+C beenden."
  fi
}

loeschen() {
  printf 'Das wirft die Datenbank UND die hochgeladenen Dateien weg. Fortfahren? [j/N] '
  read -r antwort
  case "$antwort" in
    j|J|ja|Ja) ;;
    *) echo "Abgebrochen — nichts gelöscht."; exit 0 ;;
  esac
  docker compose down -v
  rm -f .seed-gelaufen
  gut "Weg. Ein neues ./starten.sh legt alles frisch an."
}

case "$MODUS" in
  docker)   mitDocker ;;
  lokal)    ohneDocker ;;
  stoppen)  stoppen ;;
  loeschen) loeschen ;;
esac
