import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";

/**
 * Nächste laufende Nummer je Mandant und Präfix, z. B. MA-000012.
 * Nutzt die größte vorhandene Nummer der Tabelle; bei Rennen schützt der
 * Unique-Index, der Aufrufer wiederholt dann einmal.
 */
export async function nextNumber(tx: Tx, table: string, column: string, tenantId: string, prefix: string, width = 6): Promise<string> {
  const res = await tx.execute<{ max: string | null }>(
    sql`select max(substring(${sql.identifier(column)} from ${sql.raw(String(prefix.length + 2))})::int) as max from ${sql.identifier(table)} where tenant_id = ${tenantId} and ${sql.identifier(column)} ~ ${`^${prefix}-[0-9]+$`}`,
  );
  const n = Number(res.rows[0]?.max ?? 0) + 1;
  return `${prefix}-${String(n).padStart(width, "0")}`;
}
