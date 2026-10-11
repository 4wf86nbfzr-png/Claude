"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, num, dateTime, list } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createEvent, updateEvent, setEventStatus, createPosition, updatePosition, deletePosition, ensureOrder, setOrderStatus } from "@/server/modules/events/service";
import { assignShift, respondToShift, confirmShift, withdrawShift, removeOpenSlot, updateShiftTimes } from "@/server/modules/shifts/service";
import type { EventRow } from "@/server/modules/events/service";

function eventFromForm(fd: FormData) {
  return {
    customerId: str(fd, "customerId"),
    locationId: optStr(fd, "locationId"),
    contactId: optStr(fd, "contactId"),
    name: str(fd, "name"),
    startsAt: dateTime(fd, "startsAt") ?? new Date(NaN),
    endsAt: dateTime(fd, "endsAt") ?? new Date(NaN),
    setupStartsAt: dateTime(fd, "setupStartsAt"),
    teardownEndsAt: dateTime(fd, "teardownEndsAt"),
    dresscode: optStr(fd, "dresscode"),
    briefing: optStr(fd, "briefing"),
    meetingPoint: optStr(fd, "meetingPoint"),
    specialNotes: optStr(fd, "specialNotes"),
    internalNotes: optStr(fd, "internalNotes"),
    billingNotes: optStr(fd, "billingNotes"),
  };
}

function positionFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    headcountRequired: num(fd, "headcountRequired") ?? 1,
    startsAt: dateTime(fd, "startsAt") ?? new Date(NaN),
    endsAt: dateTime(fd, "endsAt") ?? new Date(NaN),
    breakMinutes: num(fd, "breakMinutes") ?? 0,
    requiredQualificationIds: list(fd, "requiredQualificationIds"),
    dresscode: optStr(fd, "dresscode"),
    notes: optStr(fd, "notes"),
    billingCategory: optStr(fd, "billingCategory"),
  };
}

const ev = (id: string) => `/veranstaltungen/${id}`;

export async function createEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("events:write");
    id = (await createEvent(ctx, eventFromForm(fd))).id;
  }, fd);
  if (r?.ok) redirect(ev(id));
  return r;
}

export async function updateEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("events:write");
    await updateEvent(ctx, str(fd, "id"), eventFromForm(fd), optStr(fd, "reason") ?? undefined);
    revalidatePath(ev(str(fd, "id")));
    return { ok: true, message: "Gespeichert." };
  }, fd);
}

export async function eventStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("events:write");
    await setEventStatus(ctx, str(fd, "id"), str(fd, "status") as EventRow["status"], optStr(fd, "reason") ?? undefined);
    revalidatePath(ev(str(fd, "id")));
  }, fd);
}

export async function createPositionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("events:write");
    await createPosition(ctx, str(fd, "eventId"), positionFromForm(fd));
    revalidatePath(ev(str(fd, "eventId")));
  }, fd);
}

export async function updatePositionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("events:write");
    await updatePosition(ctx, str(fd, "positionId"), positionFromForm(fd));
    revalidatePath(ev(str(fd, "eventId")));
  }, fd);
  if (r?.ok) redirect(ev(str(fd, "eventId")));
  return r;
}

export async function deletePositionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("events:write");
    await deletePosition(ctx, str(fd, "positionId"));
    revalidatePath(ev(str(fd, "eventId")));
  }, fd);
}

export async function orderAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("orders:write");
    const eventId = str(fd, "eventId");
    const order = await ensureOrder(ctx, eventId);
    const status = optStr(fd, "status");
    if (status) await setOrderStatus(ctx, order.id, status, { notes: optStr(fd, "notes") ?? undefined, releaseToCustomer: str(fd, "release") === "1" });
    revalidatePath(ev(eventId));
  }, fd);
}

export async function assignShiftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("shifts:assign");
    const res = await assignShift(ctx, str(fd, "shiftId"), { employeeId: str(fd, "employeeId"), mode: (str(fd, "mode") || "request") as "request", overrideReason: optStr(fd, "overrideReason"), note: optStr(fd, "note") });
    revalidatePath(ev(str(fd, "eventId")));
    return { ok: true, message: res.conflicts.length ? `Zugewiesen mit freigegebenen Konflikten (${res.conflicts.length}).` : "Zugewiesen." };
  }, fd);
  if (r?.ok) redirect(ev(str(fd, "eventId")));
  return r;
}

export async function shiftRespondAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    await respondToShift(ctx, str(fd, "shiftId"), { response: str(fd, "response") as "accepted" | "declined", note: optStr(fd, "note") });
    revalidatePath(ev(str(fd, "eventId")));
    revalidatePath("/portal/mitarbeiter");
  }, fd);
}

export async function shiftConfirmAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("shifts:assign");
    await confirmShift(ctx, str(fd, "shiftId"));
    revalidatePath(ev(str(fd, "eventId")));
  }, fd);
}

export async function shiftWithdrawAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("shifts:assign");
    await withdrawShift(ctx, str(fd, "shiftId"), str(fd, "reason"));
    revalidatePath(ev(str(fd, "eventId")));
  }, fd);
}

export async function removeSlotAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("shifts:write");
    await removeOpenSlot(ctx, str(fd, "shiftId"));
    revalidatePath(ev(str(fd, "eventId")));
  }, fd);
}

export async function shiftTimesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("shifts:write");
    await updateShiftTimes(ctx, str(fd, "shiftId"), { startsAt: dateTime(fd, "startsAt") ?? new Date(NaN), endsAt: dateTime(fd, "endsAt") ?? new Date(NaN), breakMinutes: num(fd, "breakMinutes") ?? undefined, reason: optStr(fd, "reason") });
    revalidatePath(ev(str(fd, "eventId")));
    return { ok: true, message: "Zeit geändert." };
  }, fd);
}
