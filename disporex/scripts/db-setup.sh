#!/usr/bin/env bash
# Legt Rollen und Datenbanken für die lokale Entwicklung an (idempotent).
# Voraussetzung: lokaler PostgreSQL-Server, Ausführung als Superuser (z. B. `sudo -u postgres`).
# Produktiv: Passwörter ändern, Rollen über das Secrets-Management anlegen.
set -euo pipefail
OWNER_PW="${DISPOREX_OWNER_PASSWORD:-disporex}"
APP_PW="${DISPOREX_APP_PASSWORD:-disporex_app}"
PSQL="${PSQL:-psql -v ON_ERROR_STOP=1 -U postgres}"

$PSQL <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'disporex_owner') THEN
    CREATE ROLE disporex_owner LOGIN PASSWORD '${OWNER_PW}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'disporex_app') THEN
    -- NOBYPASSRLS ist Standard; explizit, weil die Mandantentrennung darauf aufbaut.
    CREATE ROLE disporex_app LOGIN PASSWORD '${APP_PW}' NOBYPASSRLS;
  END IF;
END \$\$;
SQL

for DB in disporex disporex_test; do
  if ! $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
    $PSQL -c "CREATE DATABASE ${DB} OWNER disporex_owner"
  fi
  $PSQL -d "${DB}" -c "GRANT CONNECT ON DATABASE ${DB} TO disporex_app; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
done
echo "Datenbanken und Rollen bereit."
