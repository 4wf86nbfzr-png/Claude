#!/usr/bin/env bash
#
# pnpm restore <ordner> - spielt eine Sicherung zurueck.
#
# Der aktuelle Stand wird vorher weggesichert, nicht ueberschrieben.
# Wer sich vertut, kann zurueck.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

QUELLE="${1:-}"
DB="${JARVIS_DB_PATH:-./var/jarvis.db}"

if [ -z "$QUELLE" ]; then
  echo "Aufruf: pnpm restore <sicherungsordner>"
  echo
  echo "Vorhandene Sicherungen:"
  find backups -maxdepth 1 -name 'jarvis-*' -type d 2>/dev/null | sort | sed 's/^/  /' || echo "  keine"
  exit 1
fi

if [ ! -f "$QUELLE/jarvis.db" ]; then
  echo "In $QUELLE liegt keine jarvis.db. Es wurde nichts veraendert."
  exit 1
fi

echo "Pruefe die Sicherung..."
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1]);
const r = db.prepare('PRAGMA integrity_check').get();
const status = Object.values(r)[0];
if (status !== 'ok') { console.error('  Die Sicherung ist beschaedigt:', status); process.exit(1); }
const n = db.prepare('SELECT COUNT(*) AS n FROM events').get();
const a = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get();
console.log('  In Ordnung. Ereignisse:', n.n, ' Audit-Eintraege:', a.n);
db.close();
" "$QUELLE/jarvis.db"

if [ -f "$DB" ]; then
  SICHER="${DB}.vor-restore-$(date +%Y%m%d-%H%M%S)"
  echo "Der aktuelle Stand wird gesichert nach: $SICHER"
  cp "$DB" "$SICHER"
  # WAL und SHM mitnehmen, sonst fehlt ein Teil.
  [ -f "${DB}-wal" ] && cp "${DB}-wal" "${SICHER}-wal"
  [ -f "${DB}-shm" ] && cp "${DB}-shm" "${SICHER}-shm"
fi

mkdir -p "$(dirname "$DB")"
rm -f "${DB}-wal" "${DB}-shm"
cp "$QUELLE/jarvis.db" "$DB"

echo
echo "Zurueckgespielt."
echo
echo "Was jetzt noch fehlt:"
echo "  - Die Geheimnisse liegen im Schluesselbund und sind NICHT Teil der Sicherung."
echo "    Auf einem neuen Rechner: pnpm connect:microsoft, pnpm connect:whatsapp,"
echo "    und die PINs mit scripts/hash-pin.ts neu hinterlegen."
echo "  - Danach: pnpm status, um den Stand zu pruefen."
