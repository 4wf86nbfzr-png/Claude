"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, dateTime } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createAvailability, deleteAvailability } from "@/server/modules/availability/service";

export async function createAvailabilityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    await createAvailability(ctx, { employeeId: str(fd, "employeeId") || (ctx.employeeId ?? ""), kind: str(fd, "kind") as "unavailable", startsAt: dateTime(fd, "startsAt") ?? new Date(NaN), endsAt: dateTime(fd, "endsAt") ?? new Date(NaN), note: optStr(fd, "note") });
    revalidatePath("/verfuegbarkeiten");
    revalidatePath("/portal/mitarbeiter");
  }, fd);
}

export async function deleteAvailabilityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    await deleteAvailability(ctx, str(fd, "id"));
    revalidatePath("/verfuegbarkeiten");
    revalidatePath("/portal/mitarbeiter");
  }, fd);
}
