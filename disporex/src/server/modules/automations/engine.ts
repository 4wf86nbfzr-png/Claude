import { and, eq, sql, gte } from "drizzle-orm";
import { withTenant } from "../../db/client";
import { automationRules, automationRuns, customerRequests, users, memberships, type domainEvents, type AutomationCondition, type AutomationAction } from "../../db/schema";
import { notifyRoles, notifyUser } from "../notifications/service";
import { emitEvent, DOMAIN_EVENT_TYPES, type DomainEventType } from "../../core/events";
import { logger } from "../../core/logger";
import { computeMissingFields } from "../requests/service";
import type { RoleKey } from "../../db/schema";

type Log = { step: string; ok: boolean; message?: string }[];

function getField(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), payload);
}

export function evaluateConditions(conditions: AutomationCondition[], payload: Record<string, unknown>): { ok: boolean; failed?: string } {
  for (const c of conditions) {
    const v = getField(payload, c.field);
    const present = v !== undefined && v !== null && v !== "";
    switch (c.type) {
      case "field_present":
        if (!present) return { ok: false, failed: `${c.field} fehlt` };
        break;
      case "field_missing":
        if (present) return { ok: false, failed: `${c.field} vorhanden` };
        break;
      case "field_equals":
        if (v !== c.value) return { ok: false, failed: `${c.field} ≠ ${String(c.value)}` };
        break;
      case "field_gt":
        if (typeof v !== "number" || !(v > c.value)) return { ok: false, failed: `${c.field} nicht > ${c.value}` };
        break;
    }
  }
  return { ok: true };
}

/**
 * Führt alle aktiven Regeln eines Mandanten für ein Ereignis aus.
 * Schutzmechanismen: Deduplizierung je Regel+Ereignis, Stundenlimit je Regel,
 * keine Rekursion über von Regeln selbst erzeugte Ereignisse (actorUserId = null + Marker).
 */
export async function runAutomationsFor(ev: typeof domainEvents.$inferSelect): Promise<number> {
  const payload = ev.payload as Record<string, unknown>;
  if (payload.__automation) return 0; // Von einer Regel erzeugt: nicht erneut verarbeiten (Schleifenschutz)
  return withTenant(ev.tenantId, async (tx) => {
    const rules = await tx.select().from(automationRules).where(and(eq(automationRules.tenantId, ev.tenantId), eq(automationRules.trigger, ev.type), eq(automationRules.enabled, true)));
    let executed = 0;
    for (const rule of rules) {
      const started = Date.now();
      const dedupeKey = `${rule.id}:${ev.id}`;
      const recent = (await tx.select({ c: sql<number>`count(*)::int` }).from(automationRuns).where(and(eq(automationRuns.ruleId, rule.id), gte(automationRuns.createdAt, new Date(Date.now() - 3_600_000)))))[0]?.c ?? 0;
      if (recent >= rule.maxRunsPerHour) {
        await tx.insert(automationRuns).values({ tenantId: ev.tenantId, ruleId: rule.id, domainEventId: ev.id, status: "skipped", log: [{ step: "rate_limit", ok: false, message: `Limit ${rule.maxRunsPerHour}/h erreicht` }], dedupeKey, durationMs: 0 }).onConflictDoNothing();
        continue;
      }
      const cond = evaluateConditions(rule.conditions, payload);
      const log: Log = [{ step: "conditions", ok: cond.ok, message: cond.failed }];
      if (!cond.ok) {
        await tx.insert(automationRuns).values({ tenantId: ev.tenantId, ruleId: rule.id, domainEventId: ev.id, status: "skipped", log, dedupeKey, durationMs: Date.now() - started }).onConflictDoNothing();
        continue;
      }
      let failed = false;
      for (const action of rule.actions) {
        try {
          const msg = await executeAction(tx, ev, action);
          log.push({ step: action.type, ok: true, message: msg });
        } catch (err) {
          failed = true;
          log.push({ step: action.type, ok: false, message: err instanceof Error ? err.message : String(err) });
          logger.warn({ err, ruleId: rule.id, action: action.type }, "Automatisierungsaktion fehlgeschlagen");
        }
      }
      const inserted = await tx
        .insert(automationRuns)
        .values({ tenantId: ev.tenantId, ruleId: rule.id, domainEventId: ev.id, status: failed ? "failed" : "success", log, dedupeKey, durationMs: Date.now() - started })
        .onConflictDoNothing()
        .returning({ id: automationRuns.id });
      if (inserted[0]) executed++;
    }
    return executed;
  });
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function executeAction(tx: Tx, ev: typeof domainEvents.$inferSelect, action: AutomationAction): Promise<string> {
  const payload = ev.payload as Record<string, unknown>;
  switch (action.type) {
    case "notify_role": {
      const n = await notifyRoles(tx, ev.tenantId, [action.role as RoleKey], {
        kind: `automation.${ev.type}`,
        title: interpolate(action.title, payload),
        body: interpolate(action.body ?? "", payload),
        link: linkFor(ev),
        priority: action.priority ?? "normal",
        dedupeKey: `auto:${ev.id}:${action.role}`,
      });
      return `${n} Benutzer benachrichtigt`;
    }
    case "flag_missing_fields": {
      if (ev.entityType !== "customer_request" || !ev.entityId) throw new Error("Nur für Kundenanfragen");
      const r = (await tx.select().from(customerRequests).where(eq(customerRequests.id, ev.entityId)).limit(1))[0];
      if (!r) throw new Error("Anfrage nicht gefunden");
      const computed = computeMissingFields(r);
      const extra = action.fields.filter((f) => !getField(payload, f));
      const missing = Array.from(new Set([...computed, ...extra]));
      await tx.update(customerRequests).set({ missingFields: missing, status: missing.length && r.status === "new" ? "needs_info" : r.status }).where(eq(customerRequests.id, r.id));
      return missing.length ? `fehlend: ${missing.join(", ")}` : "vollständig";
    }
    case "set_request_status": {
      if (ev.entityType !== "customer_request" || !ev.entityId) throw new Error("Nur für Kundenanfragen");
      const allowed = ["new", "in_review", "needs_info"];
      if (!allowed.includes(action.status)) throw new Error("Automatisierungen dürfen Anfragen nicht verbindlich machen (nur new/in_review/needs_info).");
      await tx.update(customerRequests).set({ status: action.status as "new" }).where(and(eq(customerRequests.id, ev.entityId), sql`${customerRequests.status} in ('new','in_review','needs_info')`));
      return `Status ${action.status}`;
    }
    case "assign_request_to_user": {
      if (ev.entityType !== "customer_request" || !ev.entityId) throw new Error("Nur für Kundenanfragen");
      const m = (await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, ev.tenantId), eq(memberships.userId, action.userId), eq(memberships.status, "active"))).limit(1))[0];
      if (!m) throw new Error("Benutzer ist kein aktives Mitglied");
      await tx.update(customerRequests).set({ assignedUserId: action.userId }).where(eq(customerRequests.id, ev.entityId));
      const u = (await tx.select({ name: users.name }).from(users).where(eq(users.id, action.userId)).limit(1))[0];
      await notifyUser(tx, ev.tenantId, { userId: action.userId, kind: "request.assigned", title: "Anfrage zugewiesen", body: String(payload.title ?? ""), link: linkFor(ev), dedupeKey: `auto.assign:${ev.id}` });
      return `zugewiesen an ${u?.name ?? action.userId}`;
    }
    case "webhook": {
      if (!(DOMAIN_EVENT_TYPES as readonly string[]).includes(action.eventType)) throw new Error("Unbekannter Ereignistyp");
      await emitEvent(tx, { tenantId: ev.tenantId, type: action.eventType as DomainEventType, entityType: ev.entityType ?? undefined, entityId: ev.entityId, payload: { ...payload, __automation: true, sourceEvent: ev.id } });
      return `Ereignis ${action.eventType} ausgelöst`;
    }
    case "ai_extract_request": {
      const { extractRequestFromText } = await import("../ai/service");
      if (ev.entityType !== "customer_request" || !ev.entityId) throw new Error("Nur für Kundenanfragen");
      const r = (await tx.select().from(customerRequests).where(eq(customerRequests.id, ev.entityId)).limit(1))[0];
      if (!r || !r.description) return "kein Text";
      const res = await extractRequestFromText(ev.tenantId, r.description, { entityId: r.id });
      if (!res) return "KI nicht konfiguriert – übersprungen";
      await tx.update(customerRequests).set({ aiExtraction: res }).where(eq(customerRequests.id, r.id));
      return `Extraktion gespeichert (Konfidenz ${res.confidence})`;
    }
    default:
      throw new Error("Unbekannte Aktion");
  }
}

function interpolate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (_, k: string) => {
    const v = getField(payload, k);
    return v === undefined || v === null ? "" : String(v);
  });
}

function linkFor(ev: typeof domainEvents.$inferSelect): string | null {
  if (ev.entityType === "customer_request" && ev.entityId) return `/anfragen/${ev.entityId}`;
  if (ev.entityType === "event" && ev.entityId) return `/veranstaltungen/${ev.entityId}`;
  if (ev.entityType === "shift" && ev.entityId) return `/schichten/${ev.entityId}`;
  return null;
}
