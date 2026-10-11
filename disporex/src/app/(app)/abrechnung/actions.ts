"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, num, list } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createRateCard, endRateCard, deleteRateCard, createSurchargeRule, deleteSurchargeRule, generateBillingItems, finalizeBillingItems } from "@/server/modules/billing/service";
import { localToUtc } from "@/lib/tz";

export async function createRateCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("billing:write");
    await createRateCard(ctx, { customerId: optStr(fd, "customerId"), billingCategory: optStr(fd, "billingCategory"), label: str(fd, "label"), hourlyRateCents: Math.round((num(fd, "hourlyRate") ?? 0) * 100), validFrom: str(fd, "validFrom"), validTo: optStr(fd, "validTo") });
    revalidatePath("/abrechnung/saetze");
  }, fd);
}

export async function endRateCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("billing:write");
    await endRateCard(ctx, str(fd, "id"), str(fd, "validTo"));
    revalidatePath("/abrechnung/saetze");
  }, fd);
}

export async function deleteRateCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("billing:write");
    await deleteRateCard(ctx, str(fd, "id"));
    revalidatePath("/abrechnung/saetze");
  }, fd);
}

export async function createSurchargeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("billing:write");
    await createSurchargeRule(ctx, { name: str(fd, "name"), kind: str(fd, "kind") as "night", percent: num(fd, "percent") ?? 0, fromTime: optStr(fd, "fromTime"), toTime: optStr(fd, "toTime"), holidays: str(fd, "holidays").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean), validFrom: str(fd, "validFrom"), validTo: optStr(fd, "validTo") });
    revalidatePath("/abrechnung/saetze");
  }, fd);
}

export async function deleteSurchargeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("billing:write");
    await deleteSurchargeRule(ctx, str(fd, "id"));
    revalidatePath("/abrechnung/saetze");
  }, fd);
}

export async function generateBillingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("billing:write");
    const r = await generateBillingItems(ctx, str(fd, "customerId"), { from: localToUtc(`${str(fd, "von")}T00:00`), to: localToUtc(`${str(fd, "bis")}T23:59`) });
    revalidatePath("/abrechnung");
    return { ok: true, message: `${r.generated} neu, ${r.updated} aktualisiert, ${r.skippedFinal} final unverändert, ${r.missingRate} ohne Stundensatz, ${r.preliminary} vorläufig (ohne bestätigte Ist-Zeit).` };
  }, fd);
}

export async function finalizeBillingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("billing:write");
    const r = await finalizeBillingItems(ctx, list(fd, "ids"));
    revalidatePath("/abrechnung");
    return { ok: true, message: `${r.finalized} abgeschlossen, ${r.skipped} übersprungen (bereits final oder ohne bestätigte Ist-Zeit).` };
  }, fd);
}
