#!/usr/bin/env bash
#
# pnpm logs:safe - Logs ansehen, ohne dass etwas Vertrauliches sichtbar wird.
#
# Der Logger redigiert bereits beim Schreiben. Dieses Skript ist die zweite
# Sicherung fuer den Fall, dass etwas durchgerutscht ist - etwa aus einer
# Fremdbibliothek, die am Logger vorbeischreibt.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

QUELLE="${1:-logs/jarvis.log}"

if [ ! -f "$QUELLE" ]; then
  echo "Keine Logdatei unter $QUELLE."
  echo "Im Vordergrundbetrieb schreibt Jarvis nach stdout:"
  echo "  pnpm start 2>&1 | pnpm logs:safe /dev/stdin"
  exit 0
fi

sed -E \
  -e 's/(eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,})/[TOKEN]/g' \
  -e 's/(Bearer|Basic) [A-Za-z0-9._~+\/=-]{8,}/\1 [REDIGIERT]/g' \
  -e 's/[A-Za-z0-9_.~+\/=-]{40,}/[LANGER-WERT]/g' \
  -e 's/\+[0-9]{2}[0-9]{6,}/[RUFNUMMER]/g' \
  -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[ADRESSE]/g' \
  -e 's/[A-Z]{2}[0-9]{2}[ ]?([A-Za-z0-9]{4}[ ]?){2,7}/[IBAN]/g' \
  "$QUELLE"
