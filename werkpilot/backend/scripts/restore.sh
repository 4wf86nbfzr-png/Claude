#!/usr/bin/env bash
# Wiederherstellung eines Backups in eine (leere!) Datenbank.
# Aufruf: scripts/restore.sh <backup.sql.gz> <postgresql://user:pass@host:port/zieldb>
set -euo pipefail
FILE="$1"; URL="$2"
URL="${URL/postgresql+asyncpg:/postgresql:}"
gunzip -c "$FILE" | psql -v ON_ERROR_STOP=1 -q "$URL" > /dev/null
echo "Wiederhergestellt: $FILE → $URL"
