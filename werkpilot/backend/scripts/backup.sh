#!/usr/bin/env bash
# Datenbank-Backup (pg_dump, komprimiert). Aufruf: scripts/backup.sh [ziel-verzeichnis]
# Erwartet DATABASE_URL (postgresql+asyncpg://user:pass@host:port/db) oder PG* Variablen.
set -euo pipefail
DIR="${1:-${BACKUP_DIR:-./backups}}"
mkdir -p "$DIR"
URL="${DATABASE_URL:-}"
URL="${URL/postgresql+asyncpg:/postgresql:}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/werkpilot-$STAMP.sql.gz"
if [ -n "$URL" ]; then
  pg_dump --no-owner --no-privileges "$URL" | gzip -9 > "$FILE"
else
  pg_dump --no-owner --no-privileges | gzip -9 > "$FILE"
fi
# Aufbewahrung: 14 Tageskopien
ls -1t "$DIR"/werkpilot-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "$FILE"
