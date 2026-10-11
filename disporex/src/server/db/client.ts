import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { env, isTest } from "../core/env";
import { logger } from "../core/logger";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

declare global {
  var __disporexPool: Pool | undefined;
}

function connectionString(): string {
  if (isTest()) return process.env.DATABASE_TEST_URL ?? env().DATABASE_TEST_URL;
  return env().DATABASE_APP_URL ?? env().DATABASE_URL;
}

/** Ein Pool pro Prozess (Next.js lädt Module im Dev-Modus mehrfach, daher global). */
export function getPool(): Pool {
  if (!globalThis.__disporexPool) {
    const pool = new Pool({
      connectionString: connectionString(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "disporex",
    });
    pool.on("error", (err) => logger.error({ err }, "PostgreSQL-Pool-Fehler"));
    globalThis.__disporexPool = pool;
  }
  return globalThis.__disporexPool;
}

let dbInstance: Db | null = null;
export function db(): Db {
  if (!dbInstance) dbInstance = drizzle(getPool(), { schema, casing: "snake_case" });
  return dbInstance;
}

export type Scope = { tenantId: string } | { bypass: true };

/**
 * Führt `fn` in einer Transaktion aus, in der die RLS-Variablen gesetzt sind.
 * Alle Geschäftsabfragen MÜSSEN über diese Funktion laufen – außerhalb liefert
 * die Datenbank für mandantengebundene Tabellen schlicht keine Zeilen.
 */
export async function withScope<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    if ("bypass" in scope) {
      await tx.execute(sql`select set_config('app.bypass_rls', 'on', true)`);
    } else {
      if (!/^[0-9a-f-]{36}$/i.test(scope.tenantId)) throw new Error("Ungültige tenantId");
      await tx.execute(sql`select set_config('app.tenant_id', ${scope.tenantId}, true)`);
    }
    return fn(tx);
  });
}

export const withTenant = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>) => withScope({ tenantId }, fn);
export const withSystem = <T>(fn: (tx: Tx) => Promise<T>) => withScope({ bypass: true }, fn);

/** Roh-Client (für LISTEN/NOTIFY oder lange Worker-Transaktionen). */
export async function rawClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function closeDb(): Promise<void> {
  if (globalThis.__disporexPool) {
    await globalThis.__disporexPool.end();
    globalThis.__disporexPool = undefined;
    dbInstance = null;
  }
}

export { schema };
