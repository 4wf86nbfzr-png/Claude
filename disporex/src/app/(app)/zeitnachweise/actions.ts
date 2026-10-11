"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, bool, num, dateTime } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { importTimeRecords, createManualRecord, approveItem, rejectItem, correctItem, reopenItem } from "@/server/modules/time/service";

export async function importAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("time:import");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine CSV- oder XLSX-Datei auswählen." };
    if (file.size > 10 * 1024 * 1024) return { error: "Datei zu groß (max. 10 MB)." };
    const res = await importTimeRecords(ctx, { filename: file.name, data: Buffer.from(await file.arrayBuffer()) }, { force: bool(fd, "force") });
    id = res.importId;
    revalidatePath("/zeitnachweise");
    revalidatePath("/abgleich");
  }, fd);
  if (r?.ok) redirect(`/zeitnachweise/${id}`);
  return r;
}

export async function manualRecordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("time:correct");
    const r = await createManualRecord(ctx, { employeeId: str(fd, "employeeId"), startedAt: dateTime(fd, "startedAt") ?? new Date(NaN), endedAt: dateTime(fd, "endedAt") ?? new Date(NaN), breakMinutes: num(fd, "breakMinutes") ?? 0, note: optStr(fd, "note") ?? undefined });
    revalidatePath("/zeitnachweise");
    revalidatePath("/abgleich");
    const rc = r.reconciliation;
    return { ok: true, message: `Nachweis erfasst. Abgleich: ${rc.matched ? "passt zur Schicht" : rc.deviations ? "Abweichung – bitte prüfen" : "keine geplante Schicht gefunden"}.` };
  }, fd);
}

export async function approveAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("time:approve");
    await approveItem(ctx, str(fd, "id"), optStr(fd, "note") ?? undefined);
    revalidatePath(`/abgleich/${str(fd, "id")}`);
    revalidatePath("/abgleich");
  }, fd);
}

export async function rejectAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("time:approve");
    await rejectItem(ctx, str(fd, "id"), str(fd, "reason"));
    revalidatePath(`/abgleich/${str(fd, "id")}`);
    revalidatePath("/abgleich");
  }, fd);
}

export async function correctAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("time:correct");
    await correctItem(ctx, str(fd, "id"), { approvedStart: dateTime(fd, "approvedStart") ?? new Date(NaN), approvedEnd: dateTime(fd, "approvedEnd") ?? new Date(NaN), approvedBreakMinutes: num(fd, "approvedBreakMinutes") ?? 0, reason: str(fd, "reason") });
    revalidatePath(`/abgleich/${str(fd, "id")}`);
    revalidatePath("/abgleich");
    return { ok: true, message: "Korrektur gespeichert. Zur Übernahme als Ist-Zeit bitte bestätigen." };
  }, fd);
}

export async function reopenAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("time:approve");
    await reopenItem(ctx, str(fd, "id"), str(fd, "reason"));
    revalidatePath(`/abgleich/${str(fd, "id")}`);
  }, fd);
}
