import 'server-only';
import { db } from './db';
import type { SessionUser } from './auth/session';

/**
 * Revisionssichere Protokollierung (Spec 32).
 * Der Name des Handelnden wird mitgeschrieben, damit der Eintrag auch
 * lesbar bleibt, wenn der Benutzer später deaktiviert wurde.
 */
export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

export async function audit(user: Pick<SessionUser, 'id' | 'name' | 'email'> | null, input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: user?.id ?? null,
        actorLabel: user ? `${user.name} (${user.email})` : 'System',
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        before: sanitize(input.before),
        after: sanitize(input.after),
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    // Ein fehlgeschlagenes Protokoll darf die fachliche Aktion nicht kippen,
    // muss aber im Serverlog sichtbar sein.
    console.error('[HST Planer] Audit-Log konnte nicht geschrieben werden:', error);
  }
}

/** Entfernt Felder, die nicht ins Protokoll gehören, und macht Daten JSON-faehig. */
function sanitize(value: unknown): object | undefined {
  if (value == null) return undefined;
  const secret = /pass|secret|token|hash|totp/i;
  const seen = new WeakSet<object>();
  const walk = (input: unknown): unknown => {
    if (input == null) return input;
    if (input instanceof Date) return input.toISOString();
    if (typeof input === 'bigint') return input.toString();
    if (typeof input === 'object') {
      if (seen.has(input as object)) return '[zirkulär]';
      seen.add(input as object);
      if (Array.isArray(input)) return input.map(walk);
      // Prisma Decimal & Co. besitzen toString()
      if (typeof (input as { toFixed?: unknown }).toFixed === 'function') return String(input);
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
        if (secret.test(key)) continue;
        out[key] = walk(val);
      }
      return out;
    }
    return input;
  };
  const result = walk(value);
  return typeof result === 'object' && result !== null ? (result as object) : { wert: result };
}

/** Nur die Felder protokollieren, die sich wirklich geändert haben. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T>; changed: string[] } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const changed: string[] = [];
  for (const key of Object.keys(after) as Array<keyof T>) {
    const oldValue = before[key];
    const newValue = after[key];
    const same = oldValue instanceof Date && newValue instanceof Date
      ? oldValue.getTime() === newValue.getTime()
      : JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null);
    if (!same) {
      b[key] = oldValue;
      a[key] = newValue as T[keyof T];
      changed.push(String(key));
    }
  }
  return { before: b, after: a, changed };
}
