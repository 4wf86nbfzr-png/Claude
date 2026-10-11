"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, list, bool } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { suggestForRequest, applySuggestion, draftReplyForRequest, explainReconciliationItem } from "@/server/modules/ai/service";
import { ignoreInboundEmail } from "@/server/modules/email/inbound";

export async function suggestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("ai:use");
    const s = await suggestForRequest(ctx, str(fd, "id"));
    revalidatePath(`/anfragen/${str(fd, "id")}`);
    return { ok: true, message: `Vorschlag erstellt (Konfidenz: ${s.confidence}). Bitte prüfen und Felder gezielt übernehmen.` };
  }, fd);
}

export async function applySuggestionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("requests:write");
    await applySuggestion(ctx, str(fd, "id"), list(fd, "fields"), { overwrite: bool(fd, "overwrite") });
    revalidatePath(`/anfragen/${str(fd, "id")}`);
    return { ok: true, message: "Ausgewählte Felder übernommen." };
  }, fd);
}

export async function draftReplyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("ai:use");
    const d = await draftReplyForRequest(ctx, str(fd, "id"), str(fd, "tone") === "formal" ? "formal" : "warm");
    return { ok: true, message: `Betreff: ${d.subject}\n\n${d.body}\n\n– Entwurf, wird nicht automatisch versendet.` };
  }, fd);
}

export async function explainDeviationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("ai:use");
    const e = await explainReconciliationItem(ctx, str(fd, "id"));
    return { ok: true, message: `${e.summary}\n\nMögliche Ursachen: ${e.likelyCauses.join("; ")}\nEmpfehlung: ${e.recommendedAction}` };
  }, fd);
}

export async function ignoreEmailAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("requests:write");
    await ignoreInboundEmail(ctx, str(fd, "id"));
    revalidatePath("/posteingang");
  }, fd);
}
