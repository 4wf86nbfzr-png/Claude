#!/usr/bin/env bash
# Startet Jarvis mit der virtuellen Umgebung im Projektordner.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Richte die virtuelle Umgebung ein ..."
  python3 -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
fi

if [ ! -f .env ]; then
  echo "Es gibt noch keine .env -- ich lege sie aus der Vorlage an."
  cp .env.example .env
  chmod 600 .env
  echo "Bitte TELEGRAM_BOT_TOKEN und TELEGRAM_ALLOWED_IDS eintragen, dann erneut starten."
  exit 1
fi

exec .venv/bin/python -m jarvis "${@:-run}"
