#!/usr/bin/env bash
#
# pnpm backup - sichert Datenbank und Konfiguration.
#
# Wichtig bei SQLite mit WAL: die .db-Datei allein zu kopieren reicht NICHT.
# Ein Teil der Daten steht im Write-Ahead-Log. Deshalb wird die eingebaute
# Sicherungsfunktion verwendet, die einen konsistenten Stand erzeugt, auch
# waehrend Jarvis laeuft.
#
# Was NICHT gesichert wird: Geheimnisse. Die liegen im Schluesselbund des
# Betriebssystems und gehoeren nicht in eine Datei, die herumliegt.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB="${JARVIS_DB_PATH:-./var/jarvis.db}"
ZIEL="${1:-backups}"
STAND="$(date +%Y%m%d-%H%M%S)"
ORDNER="$ZIEL/jarvis-$STAND"

if [ ! -f "$DB" ]; then
  echo "Es gibt keine Datenbank unter $DB. Nichts zu sichern."
  exit 0
fi

mkdir -p "$ORDNER"

echo "Sichere Datenbank..."
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1]);
// VACUUM INTO erzeugt eine konsistente, kompakte Kopie - auch bei aktivem WAL.
db.exec(\"VACUUM INTO '\" + process.argv[2].replace(/'/g, \"''\") + \"'\");
db.close();
console.log('  Konsistente Kopie erstellt.');
" "$DB" "$ORDNER/jarvis.db"

if [ -f .env ]; then
  # Die .env enthaelt keine Geheimnisse, aber Rufnummern. Deshalb mitsichern,
  # aber im Bericht darauf hinweisen.
  cp .env "$ORDNER/env.kopie"
  echo "  .env mitgesichert (enthaelt Rufnummern, keine Geheimnisse)."
fi

cat > "$ORDNER/LIESMICH.txt" <<EOF
Jarvis-Pro-Sicherung vom $STAND

Enthalten:
  jarvis.db    Datenbank (Ereignisse, Aufgaben, Erinnerungen, Audit-Log)
  env.kopie    Konfiguration ohne Geheimnisse

NICHT enthalten und bewusst so:
  - OAuth-Tokens, API-Schluessel, PIN-Hashes.
    Die liegen im Schluesselbund des Betriebssystems.
    Nach einer Wiederherstellung auf einem anderen Rechner muessen die
    Konten neu verbunden und die PINs neu hinterlegt werden.
  - Roh-Audio. Das wird grundsaetzlich nicht gespeichert.

Wiederherstellen:
  pnpm restore $ORDNER
EOF

GROESSE="$(du -sh "$ORDNER" | cut -f1)"
echo
echo "Sicherung liegt unter: $ORDNER ($GROESSE)"
echo "Wiederherstellen mit:  pnpm restore $ORDNER"

# Alte Sicherungen aufraeumen - aber niemals die letzten sieben.
ANZAHL="$(find "$ZIEL" -maxdepth 1 -name 'jarvis-*' -type d | wc -l | tr -d ' ')"
if [ "$ANZAHL" -gt 7 ]; then
  echo
  echo "Es liegen $ANZAHL Sicherungen vor. Die aeltesten koennen weg:"
  find "$ZIEL" -maxdepth 1 -name 'jarvis-*' -type d | sort | head -n "$((ANZAHL - 7))" | sed 's/^/  /'
  echo "Sie werden NICHT automatisch geloescht. Loeschen ist deine Entscheidung."
fi
