"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, list, bool, num } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createEndpoint, updateEndpoint, deleteEndpoint, rotateEndpointSecret, retryDelivery } from "@/server/modules/webhooks/service";
import { createRule, setRuleEnabled, deleteRule, createDefaultRules } from "@/server/modules/automations/service";
import type { DomainEventType } from "@/server/core/events";

export async function createWebhookAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("webhooks:manage");
    const r = await createEndpoint(ctx, { name: str(fd, "name"), url: str(fd, "url"), eventTypes: list(fd, "eventTypes"), description: optStr(fd, "description") });
    revalidatePath("/einstellungen/webhooks");
    return { ok: true, message: `Webhook angelegt. Signaturgeheimnis (wird nicht erneut angezeigt):\n${r.secret}` };
  }, fd);
}

export async function toggleWebhookAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("webhooks:manage");
    await updateEndpoint(ctx, str(fd, "id"), { active: str(fd, "active") === "1" });
    revalidatePath("/einstellungen/webhooks");
  }, fd);
}

export async function rotateWebhookAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("webhooks:manage");
    const secret = await rotateEndpointSecret(ctx, str(fd, "id"));
    return { ok: true, message: `Neues Geheimnis:\n${secret}` };
  }, fd);
}

export async function deleteWebhookAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("webhooks:manage");
    await deleteEndpoint(ctx, str(fd, "id"));
    revalidatePath("/einstellungen/webhooks");
  }, fd);
}

export async function retryDeliveryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("webhooks:manage");
    await retryDelivery(ctx, str(fd, "id"));
    revalidatePath("/einstellungen/webhooks");
  }, fd);
}

export async function createRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("automations:manage");
    const conditions = [];
    for (let i = 0; i < 3; i++) {
      const type = str(fd, `c${i}_type`);
      const field = str(fd, `c${i}_field`).trim();
      if (!type || !field) continue;
      const raw = str(fd, `c${i}_value`).trim();
      if (type === "field_gt") conditions.push({ type, field, value: Number(raw) });
      else if (type === "field_equals") conditions.push({ type, field, value: raw === "true" ? true : raw === "false" ? false : Number.isFinite(Number(raw)) && raw !== "" ? Number(raw) : raw });
      else conditions.push({ type, field });
    }
    const actions = [];
    if (bool(fd, "a_notify")) actions.push({ type: "notify_role", role: str(fd, "a_notify_role"), title: str(fd, "a_notify_title"), body: optStr(fd, "a_notify_body") ?? undefined, priority: (str(fd, "a_notify_priority") || "normal") as "normal" });
    if (bool(fd, "a_flag")) actions.push({ type: "flag_missing_fields", fields: str(fd, "a_flag_fields").split(",").map((s) => s.trim()).filter(Boolean) });
    if (bool(fd, "a_status")) actions.push({ type: "set_request_status", status: str(fd, "a_status_value") });
    if (bool(fd, "a_webhook")) actions.push({ type: "webhook", eventType: str(fd, "a_webhook_event") as DomainEventType });
    if (bool(fd, "a_ai")) actions.push({ type: "ai_extract_request" });
    await createRule(ctx, { name: str(fd, "name"), description: optStr(fd, "description"), trigger: str(fd, "trigger") as DomainEventType, conditions: conditions as never, actions: actions as never, enabled: true, maxRunsPerHour: num(fd, "maxRunsPerHour") ?? 100 });
    revalidatePath("/einstellungen/automatisierungen");
    return { ok: true, message: "Regel angelegt." };
  }, fd);
}

export async function toggleRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("automations:manage");
    await setRuleEnabled(ctx, str(fd, "id"), str(fd, "enabled") === "1");
    revalidatePath("/einstellungen/automatisierungen");
  }, fd);
}

export async function deleteRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("automations:manage");
    await deleteRule(ctx, str(fd, "id"));
    revalidatePath("/einstellungen/automatisierungen");
  }, fd);
}

export async function defaultRulesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("automations:manage");
    const n = await createDefaultRules(ctx);
    revalidatePath("/einstellungen/automatisierungen");
    return { ok: true, message: `${n} Standardregel(n) angelegt.` };
  }, fd);
}
