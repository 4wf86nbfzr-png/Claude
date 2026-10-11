import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";

/**
 * Führt alle ausstehenden Migrationen aus. Läuft mit der Eigentümer-Verbindung
 * (DATABASE_URL), niemals mit der eingeschränkten App-Rolle.
 *   pnpm db:migrate                 -> DATABASE_URL
 *   DATABASE_URL=... pnpm db:migrate
 */
export async function runMigrations(connectionString: string, migrationsFolder = path.join(process.cwd(), "drizzle")): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL ?? "postgres://disporex_owner:disporex@localhost:5432/disporex";
  runMigrations(url)
    .then(() => {
      console.log("Migrationen angewendet.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration fehlgeschlagen:", err);
      process.exit(1);
    });
}
