import { Pool } from "pg";
import { runMigrations } from "./migrate";

/**
 * Setzt eine Datenbank vollständig zurück (Schema löschen + Migrationen).
 * Schutz: verweigert in Produktion und ohne ausdrückliche Bestätigung.
 *   DATABASE_URL=... CONFIRM_RESET=yes pnpm db:reset
 */
export async function resetDatabase(connectionString: string): Promise<void> {
  if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("db:reset ist in Produktion gesperrt.");
  }
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
    await pool.query("GRANT USAGE ON SCHEMA public TO PUBLIC;");
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  } finally {
    await pool.end();
  }
  await runMigrations(connectionString);
}

if (process.argv[1] && process.argv[1].endsWith("reset.ts")) {
  if (process.env.CONFIRM_RESET !== "yes") {
    console.error("Abgebrochen: CONFIRM_RESET=yes setzen, um die Datenbank wirklich zurückzusetzen.");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL ?? "postgres://disporex_owner:disporex@localhost:5432/disporex";
  resetDatabase(url)
    .then(() => {
      console.log("Datenbank zurückgesetzt und migriert.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
