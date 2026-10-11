import { randomUUID } from "node:crypto";

export function newRequestId(): string {
  return randomUUID();
}

/** Laufende Nummern mit Präfix (z. B. "MA-000012"). */
export function formatNumber(prefix: string, n: number, width = 6): string {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}
