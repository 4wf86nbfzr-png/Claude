-- ---------------------------------------------------------------------------
-- Mandantentrennung auf Datenbankebene (Row-Level Security) und Rechte der
-- Anwendungsrolle. Diese Migration ist idempotent und kann nach jeder
-- Schemaänderung erneut aufgerufen werden (SELECT app_apply_rls()).
--
-- Funktionsweise:
--   * Jede Tabelle mit Spalte tenant_id erhält RLS (inkl. FORCE, damit auch der
--     Tabelleneigentümer nicht versehentlich mandantenübergreifend liest).
--   * Die Anwendung setzt je Transaktion `app.tenant_id` (Sitzung eines Mandanten)
--     oder `app.bypass_rls = 'on'` (nur Systemprozesse: Login, Worker, Systemadmin).
--   * Zeilen ohne tenant_id (z. B. systemweite Jobs) sind nur im Bypass sichtbar.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_rls_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION app_apply_rls() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'memberships'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.table_name AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (app_rls_bypass() OR tenant_id = app_current_tenant()) WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant())',
        r.table_name
      );
    END IF;
  END LOOP;

  -- memberships: Benutzer müssen beim Login ihre eigenen Mitgliedschaften über alle
  -- Mandanten sehen; innerhalb eines Mandanten gilt die Isolation.
  ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
  ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memberships' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON memberships
      USING (app_rls_bypass() OR tenant_id = app_current_tenant())
      WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant());
  END IF;

  -- Rechte der Anwendungsrolle (falls vorhanden)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'disporex_app') THEN
    GRANT USAGE ON SCHEMA public TO disporex_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO disporex_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO disporex_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO disporex_app;
    -- Migrationstabelle bleibt der Eigentümerrolle vorbehalten.
    REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM disporex_app;
  END IF;
END $$;

SELECT app_apply_rls();
