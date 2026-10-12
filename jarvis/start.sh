#!/usr/bin/env bash
# Startet Jarvis mit der virtuellen Umgebung im Projektordner.
set -euo pipefail
cd "$(dirname "$0")"

# Passendes Python finden: macOS bringt ab Werk ein zu altes mit.
PY=""
for kandidat in python3.13 python3.12 python3.11 python3; do
  if command -v "$kandidat" >/dev/null 2>&1 &&      "$kandidat" -c 'import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 11) else 1)'; then
    PY="$kandidat"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "Jarvis braucht Python 3.11 oder neuer."
  echo "  macOS:  brew install python@3.12"
  echo "  Ubuntu: sudo apt install python3.12 python3.12-venv"
  exit 1
fi

if [ ! -d .venv ]; then
  echo "Richte die virtuelle Umgebung ein (mit $PY) ..."
  "$PY" -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
fi

BEFEHL="${1:-run}"

if [ ! -f .env ]; then
  echo "Es gibt noch keine .env -- ich lege sie aus der Vorlage an."
  cp .env.example .env
  chmod 600 .env
  echo
  echo "Jetzt zwei Zeilen in .env ausfuellen:"
  echo "  TELEGRAM_BOT_TOKEN=   (von @BotFather in Telegram)"
  echo "  TELEGRAM_ALLOWED_IDS= (deine ID, von @userinfobot)"
  echo
  # Nur der Start braucht die Zugangsdaten -- doctor, lernen und Hilfe gehen auch so.
  if [ "$BEFEHL" = "run" ]; then
    echo "Danach: ./start.sh doctor   und dann   ./start.sh run"
    exit 1
  fi
fi

exec .venv/bin/python -m jarvis "${@:-run}"
