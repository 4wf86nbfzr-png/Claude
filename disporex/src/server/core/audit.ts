import type { Tx } from "../db/client";
import { auditLogs } from "../db/schema";
import type { AuthContext } from "../auth/context";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

const SENSITIVE_KEYS = new Set(["passwordHash", "password", "tokenHash", "keyHash", "secretEncrypted", "secret"]);

/** Entfernt Geheimnisse, bevor ein Datensatz im Protokoll landet. */
export function scrubForAudit<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrubForAudit) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "[entfernt]" : scrubForAudit(v);
  }
  return out as T;
}

/** Schreibt einen Audit-Eintrag innerhalb der laufenden Transaktion. */
export async function audit(tx: Tx, ctx: AuthContext, input: AuditInput): Promise<void> {
  await tx.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorApiKeyId: ctx.apiKeyId ?? null,
    actorLabel: ctx.userName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before === undefined ? null : scrubForAudit(input.before),
    after: input.after === undefined ? null : scrubForAudit(input.after),
    reason: input.reason ?? null,
    requestId: ctx.requestId,
    ip: ctx.ip ?? null,
  });
}
