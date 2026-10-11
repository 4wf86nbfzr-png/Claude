"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, num, dateTime } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createRequest, updateRequest, setRequestStatus, convertRequest, assignRequest } from "@/server/modules/requests/service";

function requestFromForm(fd: FormData) {
  return {
    customerId: optStr(fd, "customerId"),
    title: str(fd, "title"),
    description: optStr(fd, "description"),
    contactName: optStr(fd, "contactName"),
    contactEmail: optStr(fd, "contactEmail"),
    contactPhone: optStr(fd, "contactPhone"),
    locationText: optStr(fd, "locationText"),
    startsAt: dateTime(fd, "startsAt"),
    endsAt: dateTime(fd, "endsAt"),
    headcount: num(fd, "headcount"),
    source: "manual" as const,
  };
}

export async function createRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("requests:write");
    const res = await createRequest(ctx, requestFromForm(fd));
    id = res.request.id;
  }, fd);
  if (r?.ok) redirect(`/anfragen/${id}`);
  return r;
}

export async function updateRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("requests:write");
    const { source: _s, ...data } = requestFromForm(fd);
    await updateRequest(ctx, str(fd, "id"), data);
    revalidatePath(`/anfragen/${str(fd, "id")}`);
    return { ok: true, message: "Gespeichert." };
  }, fd);
}

export async function requestStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("requests:write");
    await setRequestStatus(ctx, str(fd, "id"), str(fd, "status"), optStr(fd, "note") ?? undefined);
    revalidatePath(`/anfragen/${str(fd, "id")}`);
    revalidatePath("/anfragen");
  }, fd);
}

export async function assignRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("requests:write");
    await assignRequest(ctx, str(fd, "id"), optStr(fd, "userId"));
    revalidatePath(`/anfragen/${str(fd, "id")}`);
  }, fd);
}

export async function convertRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let eventId = "";
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("requests:convert");
    const res = await convertRequest(ctx, str(fd, "id"), { customerId: optStr(fd, "customerId") ?? undefined, locationId: optStr(fd, "locationId") });
    eventId = res.event.id;
  }, fd);
  if (r?.ok) redirect(`/veranstaltungen/${eventId}?hinweis=umgewandelt`);
  return r;
}
