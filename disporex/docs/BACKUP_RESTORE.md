# Backup und Wiederherstellung

Drei Dinge müssen gesichert werden. Fehlt eines, ist die Wiederherstellung unvollständig.

| Bestandteil | Was | Warum |
| ----------- | --- | ----- |
| Datenbank | PostgreSQL `disporex` (alle Tabellen inkl. `drizzle.__drizzle_migrations`) | sämtliche Fachdaten, Sitzungen, Protokolle, Jobs |
| Dokumente | Verzeichnis `STORAGE_LOCAL_PATH` (Standard `./storage`, im Container `/data/storage`) **oder** der S3-Bucket | hochgeladene Dateien liegen nicht in der Datenbank, nur ihre Metadaten |
| Geheimnisse | `APP_ENCRYPTION_KEY` (+ übrige `.env`-Werte) | Webhook-Secrets sind mit diesem Schlüssel verschlüsselt; ohne ihn sind sie nach einer Wiederherstellung unlesbar |

Den `APP_ENCRYPTION_KEY` getrennt vom Datenbank-Backup aufbewahren (Passwortmanager / Secrets-
Store), nicht im selben Archiv.

## Backup erstellen

### Datenbank (logisch, empfohlen für Pilotbetrieb)

```bash
# Format "custom": komprimiert, selektiv wiederherstellbar
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$DATABASE_URL" \
  --file="disporex-$(date +%F-%H%M).dump"
```

Mit Docker Compose:

```bash
docker compose exec -T db pg_dump -U disporex_owner --format=custom --no-owner --no-privileges disporex \
  > "disporex-$(date +%F-%H%M).dump"
```

- `--no-owner --no-privileges`: die Rollen werden im Ziel über `scripts/db-setup.sh` und die
  Migration `0001_rls_and_grants.sql` angelegt; so lässt sich das Backup auch in eine Instanz
  mit anderen Rollennamen einspielen.
- Zeitplan: täglich, zusätzlich **unmittelbar vor jeder Migration**. Aufbewahrung z. B.
  7 tägliche, 4 wöchentliche, 6 monatliche Stände. Backups enthalten personenbezogene Daten:
  verschlüsselt ablegen und die Löschfristen des Löschkonzepts auch auf Backups anwenden
  (spätestens mit dem Verfall der Aufbewahrung).
- Für Point-in-Time-Recovery (WAL-Archivierung) ist ein verwalteter PostgreSQL-Dienst oder
  pgBackRest der nächste Schritt; nicht Teil dieses Pakets.

### Dokumente

```bash
# lokal
tar -czf "storage-$(date +%F).tar.gz" -C "$(dirname "$STORAGE_LOCAL_PATH")" "$(basename "$STORAGE_LOCAL_PATH")"
# Docker-Volume
docker run --rm -v disporex_storage:/data -v "$PWD":/backup alpine \
  tar -czf "/backup/storage-$(date +%F).tar.gz" -C /data .
# S3: Versionierung + Lifecycle-Regeln im Bucket aktivieren oder in einen zweiten Bucket replizieren
```

Datenbank und Dokumente möglichst zeitnah zueinander sichern; ein Dokument, dessen Datei fehlt,
wird in der UI als nicht abrufbar angezeigt und im Log gemeldet.

## Wiederherstellung

Reihenfolge einhalten. Nie in die laufende Produktionsdatenbank zurückspielen, solange nicht
klar ist, dass der aktuelle Stand verworfen werden soll – stattdessen zuerst in eine
Prüfinstanz.

1. **Prüfinstanz anlegen**
   ```bash
   createdb -O disporex_owner disporex_restore
   pg_restore --no-owner --no-privileges --dbname=postgres://disporex_owner:…@host/disporex_restore disporex-2026-10-11-0200.dump
   ```
2. **Rollen und RLS prüfen** – die Policies kommen aus dem Dump mit. Kontrolle:
   ```sql
   select count(*) from pg_policies where policyname = 'tenant_isolation';   -- erwartet: 44
   select rolname, rolbypassrls from pg_roles where rolname like 'disporex%'; -- app: false
   ```
   Fehlen Grants (anderer Rollenname), die Grant-Blöcke aus `drizzle/0001_rls_and_grants.sql`
   erneut ausführen.
3. **Migrationsstand prüfen**: `select * from drizzle.__drizzle_migrations order by id;` muss
   zur eingesetzten Codeversion passen. Ist der Code neuer als das Backup: `pnpm db:migrate`
   gegen die Prüfinstanz.
4. **Dokumente zurückspielen** in `STORAGE_LOCAL_PATH` bzw. den Bucket.
5. **Geheimnisse setzen**: dieselbe `APP_ENCRYPTION_KEY` wie zum Zeitpunkt des Backups.
6. **Anwendung gegen die Prüfinstanz starten** (`DATABASE_APP_URL` auf `disporex_restore`),
   `GET /api/health` prüfen, anmelden, Stichproben: Mitarbeiterliste, eine Veranstaltung mit
   Schichten, ein Dokument herunterladen, Einstellungen → Webhooks (Secret entschlüsselbar?).
7. **Umschalten**: Web und Worker stoppen, Produktionsdatenbank umbenennen (nicht löschen),
   Prüfinstanz umbenennen, Prozesse starten. Die alte Datenbank erst nach Freigabe entfernen.
8. **Nacharbeit**: Jobs in der Zeit zwischen Backup und Ausfall sind verloren oder doppelt –
   Einstellungen → System (Jobs) und Zustellung (Benachrichtigungen) sowie Webhook-Zustellungen
   prüfen; betroffene Partner/Kunden informieren.

## Wiederherstellung üben

Mindestens vierteljährlich das Backup in eine leere Instanz einspielen und Schritt 6
durchführen. Ein Backup, das nie zurückgespielt wurde, gilt als nicht vorhanden. Ergebnis
(Datum, Dauer, Befund) kurz dokumentieren.

## Was nicht gesichert werden muss

- `.next/`-Build, `node_modules/` – aus dem Repository reproduzierbar.
- Rate-Limit-Zähler (prozesslokal), laufende Sitzungen (liegen in der Datenbank und werden
  mit gesichert; nach einer Wiederherstellung sind ältere Sitzungen ggf. ungültig).
