"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, bool } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createCustomer, updateCustomer, upsertContact, deleteContact, upsertLocation } from "@/server/modules/customers/service";

function customerFromForm(fd: FormData) {
  return {
    customerNumber: optStr(fd, "customerNumber"),
    name: str(fd, "name"),
    legalName: optStr(fd, "legalName"),
    status: (str(fd, "status") || "active") as "active",
    email: optStr(fd, "email"),
    phone: optStr(fd, "phone"),
    website: optStr(fd, "website"),
    billingAddress: { street: optStr(fd, "street"), zip: optStr(fd, "zip"), city: optStr(fd, "city"), country: optStr(fd, "country") },
    billingEmail: optStr(fd, "billingEmail"),
    vatId: optStr(fd, "vatId"),
    paymentTermsDays: optStr(fd, "paymentTermsDays"),
    requirements: optStr(fd, "requirements"),
    notes: optStr(fd, "notes"),
  };
}

export async function createCustomerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const { ctx } = await requireCurrent("customers:write");
    id = (await createCustomer(ctx, customerFromForm(fd))).id;
  }, fd);
  if (r?.ok) redirect(`/kunden/${id}`);
  return r;
}

export async function updateCustomerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("customers:write");
    await updateCustomer(ctx, str(fd, "id"), customerFromForm(fd));
    revalidatePath(`/kunden/${str(fd, "id")}`);
    return { ok: true, message: "Gespeichert." };
  }, fd);
}

export async function contactAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("customers:write");
    await upsertContact(ctx, str(fd, "customerId"), { name: str(fd, "name"), role: optStr(fd, "role"), email: optStr(fd, "email"), phone: optStr(fd, "phone"), isPrimary: bool(fd, "isPrimary") }, optStr(fd, "contactId") ?? undefined);
    revalidatePath(`/kunden/${str(fd, "customerId")}`);
  }, fd);
}

export async function deleteContactAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("customers:write");
    await deleteContact(ctx, str(fd, "customerId"), str(fd, "contactId"));
    revalidatePath(`/kunden/${str(fd, "customerId")}`);
  }, fd);
}

export async function locationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("customers:write");
    await upsertLocation(ctx, { customerId: optStr(fd, "customerId"), name: str(fd, "name"), street: optStr(fd, "street"), zip: optStr(fd, "zip"), city: optStr(fd, "city"), country: optStr(fd, "country"), notes: optStr(fd, "notes") }, optStr(fd, "locationId") ?? undefined);
    const cid = optStr(fd, "customerId");
    revalidatePath(cid ? `/kunden/${cid}` : "/kunden");
  }, fd);
}
