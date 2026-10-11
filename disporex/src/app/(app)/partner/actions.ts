"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, list, bool, num, dateTime } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createPartner, updatePartner, upsertPartnerContact, createOffer, respondToOffer, withdrawOffer } from "@/server/modules/partners/service";

function partnerFromForm(fd: FormData) {
  return { name: str(fd, "name"), status: (str(fd, "status") || "active") as "active", email: optStr(fd, "email"), phone: optStr(fd, "phone"), city: optStr(fd, "city"), qualificationIds: list(fd, "qualificationIds"), complianceNotes: optStr(fd, "complianceNotes"), notes: optStr(fd, "notes") };
}

export async function createPartnerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("partners:write");
    id = (await createPartner(ctx, partnerFromForm(fd))).id;
  }, fd);
  if (r?.ok) redirect(`/partner/${id}`);
  return r;
}

export async function updatePartnerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("partners:write");
    await updatePartner(ctx, str(fd, "id"), partnerFromForm(fd));
    revalidatePath(`/partner/${str(fd, "id")}`);
    return { ok: true, message: "Gespeichert." };
  }, fd);
}

export async function partnerContactAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("partners:write");
    await upsertPartnerContact(ctx, str(fd, "partnerId"), { name: str(fd, "name"), role: optStr(fd, "role"), email: optStr(fd, "email"), phone: optStr(fd, "phone"), isPrimary: bool(fd, "isPrimary") });
    revalidatePath(`/partner/${str(fd, "partnerId")}`);
  }, fd);
}

export async function createOfferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("partners:write");
    const r = await createOffer(ctx, { partnerId: str(fd, "partnerId"), positionId: str(fd, "positionId"), headcountRequested: num(fd, "headcountRequested") ?? 1, message: optStr(fd, "message"), shareBriefing: bool(fd, "shareBriefing"), deadlineAt: dateTime(fd, "deadlineAt") });
    revalidatePath(`/veranstaltungen/${str(fd, "eventId")}`);
    revalidatePath(`/partner/${str(fd, "partnerId")}`);
    return { ok: true, message: r.missingQualifications.length ? `Angebot gesendet. Hinweis: Partner hat ${r.missingQualifications.length} geforderte Qualifikation(en) nicht hinterlegt.` : "Angebot an Partner gesendet." };
  }, fd);
}

export async function respondOfferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    const names = str(fd, "staffNames")
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    await respondToOffer(ctx, str(fd, "offerId"), { response: str(fd, "response") as "accepted", headcountCommitted: num(fd, "headcountCommitted") ?? 0, responseNote: optStr(fd, "responseNote"), staffNames: names });
    revalidatePath("/portal/partner");
    revalidatePath(`/partner/${str(fd, "partnerId")}`);
    return { ok: true, message: "Rückmeldung gespeichert." };
  }, fd);
}

export async function withdrawOfferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("partners:write");
    await withdrawOffer(ctx, str(fd, "offerId"));
    revalidatePath(`/partner/${str(fd, "partnerId")}`);
  }, fd);
}
