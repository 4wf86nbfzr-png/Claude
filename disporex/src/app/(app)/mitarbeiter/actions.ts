"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, list } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createEmployee, updateEmployee, setEmployeeStatus, addEmployeeNote, setEmployeeQualification, removeEmployeeQualification, importEmployeesCsv } from "@/server/modules/employees/service";
import { createInvitation } from "@/server/auth/service";

function employeeFromForm(fd: FormData) {
  return {
    employeeNumber: optStr(fd, "employeeNumber"),
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    email: optStr(fd, "email"),
    phone: optStr(fd, "phone"),
    city: optStr(fd, "city"),
    status: (str(fd, "status") || "active") as "active",
    employmentType: optStr(fd, "employmentType"),
    areas: list(fd, "areas"),
    notes: optStr(fd, "notes"),
    orgNotes: optStr(fd, "orgNotes"),
  };
}

export async function createEmployeeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    const e = await createEmployee(ctx, employeeFromForm(fd));
    id = e.id;
  }, fd);
  if (r?.ok) redirect(`/mitarbeiter/${id}`);
  return r;
}

export async function updateEmployeeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    await updateEmployee(ctx, str(fd, "id"), employeeFromForm(fd));
    revalidatePath(`/mitarbeiter/${str(fd, "id")}`);
    return { ok: true, message: "Gespeichert." };
  }, fd);
}

export async function employeeStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    await setEmployeeStatus(ctx, str(fd, "id"), str(fd, "status") as "active" | "inactive" | "left", optStr(fd, "reason") ?? undefined);
    revalidatePath(`/mitarbeiter/${str(fd, "id")}`);
    revalidatePath("/mitarbeiter");
  }, fd);
}

export async function addNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    await addEmployeeNote(ctx, str(fd, "id"), { kind: (str(fd, "kind") || "note") as "note", body: str(fd, "body") });
    revalidatePath(`/mitarbeiter/${str(fd, "id")}`);
  }, fd);
}

export async function setQualificationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    await setEmployeeQualification(ctx, str(fd, "id"), { qualificationId: str(fd, "qualificationId"), validFrom: optStr(fd, "validFrom"), validUntil: optStr(fd, "validUntil"), note: optStr(fd, "note") });
    revalidatePath(`/mitarbeiter/${str(fd, "id")}`);
  }, fd);
}

export async function removeQualificationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    await removeEmployeeQualification(ctx, str(fd, "id"), str(fd, "qualificationId"));
    revalidatePath(`/mitarbeiter/${str(fd, "id")}`);
  }, fd);
}

export async function inviteEmployeeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("users:write");
    const r = await createInvitation(ctx.tenantId, ctx.userId!, { email: str(fd, "email"), role: "employee", employeeId: str(fd, "id") });
    revalidatePath(`/mitarbeiter/${str(fd, "id")}`);
    return { ok: true, message: r.mailOk ? "Einladung versendet." : `Einladung angelegt. Link: ${r.link}` };
  }, fd);
}

export async function importEmployeesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:import");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine CSV-Datei auswählen." };
    if (file.size > 5 * 1024 * 1024) return { error: "Datei zu groß (max. 5 MB)." };
    const text = await file.text();
    const dry = str(fd, "mode") === "dry";
    const r = await importEmployeesCsv(ctx, text, { dryRun: dry });
    revalidatePath("/mitarbeiter");
    const errs = r.errors.slice(0, 20).map((e) => `Zeile ${e.row}: ${e.message}`).join("\n");
    return { ok: true, message: `${dry ? "Testlauf" : "Import"}: ${r.created} neu, ${r.updated} aktualisiert, ${r.errors.length} Fehler.${errs ? `\n${errs}` : ""}` };
  }, fd);
}
