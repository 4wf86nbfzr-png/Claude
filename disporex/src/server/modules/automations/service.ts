import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "../../db/client";
import { automationRules, automationRuns, type AutomationAction, type AutomationCondition } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { NotFoundError } from "../../core/errors";
import { audit } from "../../core/audit";
import { DOMAIN_EVENT_TYPES } from "../../core/events";
import { ROLE_KEYS } from "../../db/schema";

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("field_present"), field: z.string().min(1).max(60) }),
  z.object({ type: z.literal("field_missing"), field: z.string().min(1).max(60) }),
  z.object({ type: z.literal("field_equals"), field: z.string().min(1).max(60), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ type: z.literal("field_gt"), field: z.string().min(1).max(60), value: z.number() }),
]);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notify_role"), role: z.enum(ROLE_KEYS), title: z.string().min(1).max(200), body: z.string().max(2000).optional(), priority: z.enum(["low", "normal", "high", "critical"]).optional() }),
  z.object({ type: z.literal("flag_missing_fields"), fields: z.array(z.string().max(60)).max(20) }),
  z.object({ type: z.literal("set_request_status"), status: z.enum(["new", "in_review", "needs_info"]) }),
  z.object({ type: z.literal("assign_request_to_user"), userId: z.string().uuid() }),
  z.object({ type: z.literal("webhook"), eventType: z.enum(DOMAIN_EVENT_TYPES) }),
  z.object({ type: z.literal("ai_extract_request") }),
]);

export const ruleInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  trigger: z.enum(DOMAIN_EVENT_TYPES),
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1).max(10),
  enabled: z.boolean().default(true),
  maxRunsPerHour: z.coerce.number().int().min(1).max(10000).default(100),
});

export async function listRules(ctx: AuthContext) {
  requirePermission(ctx, "automations:manage");
  return withTenant(ctx.tenantId, (tx) => tx.select().from(automationRules).where(eq(automationRules.tenantId, ctx.tenantId)).orderBy(automationRules.name));
}

export async function createRule(ctx: AuthContext, input: z.infer<typeof ruleInput>) {
  requirePermission(ctx, "automations:manage");
  const data = ruleInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.insert(automationRules).values({ tenantId: ctx.tenantId, ...data, description: data.description ?? null, conditions: data.conditions as AutomationCondition[], actions: data.actions as AutomationAction[], createdBy: ctx.userId }).returning();
    await audit(tx, ctx, { action: "automation.created", entityType: "automation_rule", entityId: row!.id, after: row });
    return row!;
  });
}

export async function setRuleEnabled(ctx: AuthContext, id: string, enabled: boolean) {
  requirePermission(ctx, "automations:manage");
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.update(automationRules).set({ enabled }).where(and(eq(automationRules.id, id), eq(automationRules.tenantId, ctx.tenantId))).returning({ id: automationRules.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: enabled ? "automation.enabled" : "automation.disabled", entityType: "automation_rule", entityId: id });
  });
}

export async function deleteRule(ctx: AuthContext, id: string) {
  requirePermission(ctx, "automations:manage");
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.delete(automationRules).where(and(eq(automationRules.id, id), eq(automationRules.tenantId, ctx.tenantId))).returning({ id: automationRules.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "automation.deleted", entityType: "automation_rule", entityId: id });
  });
}

export async function listRuns(ctx: AuthContext, ruleId?: string, limit = 100) {
  requirePermission(ctx, "automations:manage");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ run: automationRuns, ruleName: automationRules.name })
      .from(automationRuns)
      .innerJoin(automationRules, eq(automationRules.id, automationRuns.ruleId))
      .where(and(eq(automationRuns.tenantId, ctx.tenantId), ruleId ? eq(automationRuns.ruleId, ruleId) : undefined))
      .orderBy(desc(automationRuns.createdAt))
      .limit(limit),
  );
}

/** Empfohlene Standardregeln (werden nur angelegt, wenn noch keine Regel mit dem Namen existiert). */
export async function createDefaultRules(ctx: AuthContext): Promise<number> {
  requirePermission(ctx, "automations:manage");
  const defaults: z.infer<typeof ruleInput>[] = [
    {
      name: "Neue Kundenanfrage prüfen",
      description: "Validiert eingehende Anfragen, kennzeichnet fehlende Angaben und benachrichtigt die Disposition.",
      trigger: "customer_request.created",
      conditions: [{ type: "field_present", field: "title" }],
      actions: [
        { type: "flag_missing_fields", fields: ["startsAt", "endsAt", "locationText", "headcount"] },
        { type: "notify_role", role: "dispatcher", title: "Anfrage prüfen: {title}", body: "Eingang über {source}. Fehlende Angaben wurden gekennzeichnet.", priority: "normal" },
      ],
      enabled: true,
      maxRunsPerHour: 200,
    },
    {
      name: "Frei gewordene Position melden",
      description: "Meldet Einsatzleitern, wenn eine Position durch Absage oder Fristablauf wieder offen ist.",
      trigger: "shift.opened",
      conditions: [],
      actions: [{ type: "notify_role", role: "operations_lead", title: "Position wieder offen", body: "Grund: {reason}", priority: "high" }],
      enabled: true,
      maxRunsPerHour: 200,
    },
    {
      name: "Abweichung im Abgleich melden",
      description: "Benachrichtigt die Buchhaltung bei festgestellten Abweichungen.",
      trigger: "reconciliation.deviation",
      conditions: [],
      actions: [{ type: "notify_role", role: "accounting", title: "Abweichung: {deviationMinutes} Minuten", body: "Bitte im Soll-Ist-Abgleich prüfen.", priority: "normal" }],
      enabled: true,
      maxRunsPerHour: 500,
    },
  ];
  const existing = await listRules(ctx);
  let n = 0;
  for (const d of defaults) {
    if (existing.some((r) => r.name === d.name)) continue;
    await createRule(ctx, d);
    n++;
  }
  return n;
}
