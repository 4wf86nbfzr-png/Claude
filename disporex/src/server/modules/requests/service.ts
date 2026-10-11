import { and, eq, sql, asc, desc, ilike, or, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "../../db/client";
import { customerRequests, customers, events, orders, positions, shifts, users, qualifications } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { sha256 } from "../../core/crypto";
import { emitEvent } from "../../core/events";
import { toPage, offsetOf } from "../../core/pagination";
import { notifyRoles } from "../notifications/service";
import { nextNumber } from "../../core/numbering";
import { requestInput, requestListQuery, type RequestInput } from "./schema";

export type CustomerRequest = typeof customerRequests.$inferSelect;

export const REQUIRED_FOR_CONVERSION = ["startsAt", "endsAt", "locationText", "headcount"] as const;

/** Welche Angaben fehlen, bevor aus der Anfrage eine Veranstaltung werden kann. */
export function computeMissingFields(r: Pick<RequestInput, "startsAt" | "endsAt" | "locationText" | "headcount" | "contactEmail" | "contactPhone" | "customerId">): string[] {
  const missing: string[] = [];
  if (!r.startsAt) missing.push("startsAt");
  if (!r.endsAt) missing.push("endsAt");
  if (!r.locationText) missing.push("locationText");
  if (!r.headcount) missing.push("headcount");
  if (!r.contactEmail && !r.contactPhone) missing.push("contact");
  if (!r.customerId) missing.push("customerId");
  return missing;
}

/** Fingerabdruck zur Duplikaterkennung: Titel + Beginn (Tag) + Ort + Kontakt, normalisiert. */
export function dedupeHashFor(r: Pick<RequestInput, "title" | "startsAt" | "locationText" | "contactEmail" | "headcount">): string {
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9äöüß@]/g, "");
  const day = r.startsAt ? new Date(r.startsAt).toISOString().slice(0, 10) : "";
  return sha256([norm(r.title), day, norm(r.locationText), norm(r.contactEmail), String(r.headcount ?? "")].join("|"));
}

export async function listRequests(ctx: AuthContext, query: Partial<z.infer<typeof requestListQuery>> = {}) {
  requirePermission(ctx, "requests:read");
  const q = requestListQuery.parse(query);
  const conds = [eq(customerRequests.tenantId, ctx.tenantId)];
  if (ctx.role === "customer") conds.push(eq(customerRequests.customerId, ctx.customerId ?? "00000000-0000-0000-0000-000000000000"));
  if (q.status === "open") conds.push(inArray(customerRequests.status, ["new", "in_review", "needs_info", "quoted", "accepted"]));
  else if (q.status !== "all") conds.push(eq(customerRequests.status, q.status));
  if (q.customerId) conds.push(eq(customerRequests.customerId, q.customerId));
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(or(ilike(customerRequests.title, like), ilike(customerRequests.contactName, like), ilike(customerRequests.locationText, like), ilike(customerRequests.contactEmail, like))!);
  }
  const where = and(...conds);
  const col = { createdAt: customerRequests.createdAt, startsAt: customerRequests.startsAt, title: customerRequests.title, status: customerRequests.status }[q.sort];
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({ r: customerRequests, customerName: customers.name })
      .from(customerRequests)
      .leftJoin(customers, eq(customers.id, customerRequests.customerId))
      .where(where)
      .orderBy(q.dir === "asc" ? asc(col) : desc(col))
      .limit(q.pageSize)
      .offset(offsetOf(q));
    const total = (await tx.select({ c: sql<number>`count(*)::int` }).from(customerRequests).where(where))[0]?.c ?? 0;
    return toPage(
      rows.map((x) => ({ ...x.r, customerName: x.customerName })),
      total,
      q,
    );
  });
}

export async function getRequest(ctx: AuthContext, id: string) {
  requirePermission(ctx, "requests:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const row = (
      await tx
        .select({ r: customerRequests, customerName: customers.name, assignedName: users.name })
        .from(customerRequests)
        .leftJoin(customers, eq(customers.id, customerRequests.customerId))
        .leftJoin(users, eq(users.id, customerRequests.assignedUserId))
        .where(and(eq(customerRequests.id, id), eq(customerRequests.tenantId, ctx.tenantId)))
        .limit(1)
    )[0];
    if (!row) throw new NotFoundError("Anfrage nicht gefunden");
    if (ctx.role === "customer" && row.r.customerId !== ctx.customerId) throw new NotFoundError("Anfrage nicht gefunden");
    const dupOf = row.r.duplicateOfId ? (await tx.select({ id: customerRequests.id, title: customerRequests.title, status: customerRequests.status }).from(customerRequests).where(eq(customerRequests.id, row.r.duplicateOfId)).limit(1))[0] : null;
    return { request: row.r, customerName: row.customerName, assignedName: row.assignedName, duplicateOf: dupOf ?? null };
  });
}

export type CreateRequestResult = { request: CustomerRequest; duplicate: boolean; existing: boolean };

/**
 * Legt eine Kundenanfrage an. Erkennt Duplikate über externalRef (exakt) und
 * Fingerabdruck (gleiche Anfrage innerhalb von 30 Tagen). Benachrichtigt die Disposition.
 */
export async function createRequest(ctx: AuthContext, input: RequestInput): Promise<CreateRequestResult> {
  requirePermission(ctx, "requests:write");
  const data = requestInput.parse(input);
  if (ctx.role === "customer") data.customerId = ctx.customerId;
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) throw new ValidationError("Ende muss nach Beginn liegen.");
  return withTenant(ctx.tenantId, async (tx) => {
    if (data.customerId) {
      const c = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, data.customerId), eq(customers.tenantId, ctx.tenantId))).limit(1);
      if (!c[0]) throw new NotFoundError("Kunde nicht gefunden");
    } else if (data.contactEmail) {
      // Kunde über E-Mail-Domain/Adresse zuordnen (nur eindeutige Treffer)
      const match = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.email, data.contactEmail))).limit(2);
      if (match.length === 1) data.customerId = match[0]!.id;
    }
    if (data.externalRef) {
      const ex = (await tx.select().from(customerRequests).where(and(eq(customerRequests.tenantId, ctx.tenantId), eq(customerRequests.externalRef, data.externalRef))).limit(1))[0];
      if (ex) return { request: ex, duplicate: false, existing: true };
    }
    const dedupeHash = dedupeHashFor(data);
    const dup = (
      await tx
        .select()
        .from(customerRequests)
        .where(and(eq(customerRequests.tenantId, ctx.tenantId), eq(customerRequests.dedupeHash, dedupeHash), gte(customerRequests.createdAt, new Date(Date.now() - 30 * 86_400_000)), sql`${customerRequests.status} <> 'duplicate'`))
        .limit(1)
    )[0];
    const missingFields = computeMissingFields(data);
    const [row] = await tx
      .insert(customerRequests)
      .values({
        tenantId: ctx.tenantId,
        customerId: data.customerId ?? null,
        status: dup ? "duplicate" : "new",
        source: data.source,
        title: data.title,
        description: data.description ?? null,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        locationText: data.locationText ?? null,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        headcount: data.headcount ?? null,
        requestedRoles: data.requestedRoles ?? null,
        missingFields,
        rawPayload: input as unknown as Record<string, unknown>,
        dedupeHash,
        duplicateOfId: dup?.id ?? null,
        externalRef: data.externalRef ?? null,
        createdBy: ctx.userId,
      })
      .returning();
    await audit(tx, ctx, { action: "request.created", entityType: "customer_request", entityId: row!.id, after: { title: row!.title, status: row!.status, missingFields } });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "customer_request.created", entityType: "customer_request", entityId: row!.id, payload: publicRequest(row!), actorUserId: ctx.userId });
    if (!dup) {
      await notifyRoles(tx, ctx.tenantId, ["dispatcher", "tenant_admin"], {
        kind: "request.new",
        title: `Neue Kundenanfrage: ${row!.title}`,
        body: missingFields.length ? `Fehlende Angaben: ${missingFields.map(labelMissing).join(", ")}` : "Alle Pflichtangaben vorhanden.",
        link: `/anfragen/${row!.id}`,
        priority: "normal",
        dedupeKey: `request.new:${row!.id}`,
      });
    }
    return { request: row!, duplicate: Boolean(dup), existing: false };
  });
}

export function labelMissing(f: string): string {
  return { startsAt: "Beginn", endsAt: "Ende", locationText: "Einsatzort", headcount: "Personalbedarf", contact: "Kontakt (E-Mail oder Telefon)", customerId: "Kunde" }[f] ?? f;
}

export function publicRequest(r: CustomerRequest) {
  return {
    id: r.id,
    status: r.status,
    source: r.source,
    title: r.title,
    description: r.description,
    customerId: r.customerId,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    locationText: r.locationText,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    headcount: r.headcount,
    requestedRoles: r.requestedRoles,
    missingFields: r.missingFields,
    externalRef: r.externalRef,
    duplicateOfId: r.duplicateOfId,
    convertedEventId: r.convertedEventId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function updateRequest(ctx: AuthContext, id: string, input: Partial<RequestInput>) {
  requirePermission(ctx, "requests:write");
  const data = requestInput.partial().parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(customerRequests).where(and(eq(customerRequests.id, id), eq(customerRequests.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Anfrage nicht gefunden");
    if (ctx.role === "customer" && before.customerId !== ctx.customerId) throw new NotFoundError("Anfrage nicht gefunden");
    if (before.status === "converted") throw new ConflictError("Umgewandelte Anfragen werden über die Veranstaltung gepflegt.");
    const merged = { ...before, ...data } as typeof before;
    const missingFields = computeMissingFields({ ...merged, customerId: merged.customerId });
    const { source: _s, ...rest } = data;
    const [row] = await tx
      .update(customerRequests)
      .set({ ...rest, missingFields, dedupeHash: dedupeHashFor(merged) })
      .where(eq(customerRequests.id, id))
      .returning();
    await audit(tx, ctx, { action: "request.updated", entityType: "customer_request", entityId: id, before, after: row });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "customer_request.updated", entityType: "customer_request", entityId: id, payload: publicRequest(row!), actorUserId: ctx.userId });
    return row!;
  });
}

const TRANSITIONS: Record<string, string[]> = {
  new: ["in_review", "needs_info", "quoted", "accepted", "declined", "duplicate"],
  in_review: ["needs_info", "quoted", "accepted", "declined", "duplicate"],
  needs_info: ["in_review", "quoted", "accepted", "declined"],
  quoted: ["accepted", "declined", "needs_info"],
  accepted: ["converted", "declined"],
  declined: ["new"],
  duplicate: ["new"],
  converted: [],
};

export async function setRequestStatus(ctx: AuthContext, id: string, status: string, note?: string) {
  requirePermission(ctx, "requests:write");
  if (status === "converted") throw new ValidationError("Umwandlung erfolgt über „In Veranstaltung umwandeln“.");
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(customerRequests).where(and(eq(customerRequests.id, id), eq(customerRequests.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError();
    if (!TRANSITIONS[before.status]?.includes(status)) throw new ConflictError(`Übergang ${before.status} → ${status} ist nicht erlaubt.`);
    const [row] = await tx
      .update(customerRequests)
      .set({ status: status as CustomerRequest["status"], duplicateOfId: status === "new" ? null : before.duplicateOfId })
      .where(eq(customerRequests.id, id))
      .returning();
    await audit(tx, ctx, { action: "request.status_changed", entityType: "customer_request", entityId: id, before: { status: before.status }, after: { status }, reason: note });
    return row!;
  });
}

export async function assignRequest(ctx: AuthContext, id: string, userId: string | null) {
  requirePermission(ctx, "requests:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.update(customerRequests).set({ assignedUserId: userId }).where(and(eq(customerRequests.id, id), eq(customerRequests.tenantId, ctx.tenantId))).returning({ id: customerRequests.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "request.assigned", entityType: "customer_request", entityId: id, after: { userId } });
  });
}

/**
 * Umwandlung: Anfrage → Veranstaltung (Status "planned") + Auftrag (Status "draft").
 * Der Auftrag wird erst durch ausdrückliche Bestätigung verbindlich.
 */
export async function convertRequest(ctx: AuthContext, id: string, opts: { customerId?: string; locationId?: string | null } = {}) {
  requirePermission(ctx, "requests:convert");
  return withTenant(ctx.tenantId, async (tx) => {
    const r = (await tx.select().from(customerRequests).where(and(eq(customerRequests.id, id), eq(customerRequests.tenantId, ctx.tenantId))).limit(1))[0];
    if (!r) throw new NotFoundError("Anfrage nicht gefunden");
    if (r.status === "converted") throw new ConflictError("Anfrage wurde bereits umgewandelt.");
    if (r.status === "declined" || r.status === "duplicate") throw new ConflictError("Abgelehnte oder doppelte Anfragen können nicht umgewandelt werden.");
    const customerId = opts.customerId ?? r.customerId;
    const missing = computeMissingFields({ ...r, customerId }).filter((f) => f !== "contact");
    if (missing.length) throw new ValidationError(`Vor der Umwandlung fehlen: ${missing.map(labelMissing).join(", ")}`);
    const [ev] = await tx
      .insert(events)
      .values({
        tenantId: ctx.tenantId,
        customerId: customerId!,
        locationId: opts.locationId ?? null,
        requestId: r.id,
        name: r.title,
        status: "planned",
        startsAt: r.startsAt!,
        endsAt: r.endsAt!,
        meetingPoint: r.locationText,
        briefing: r.description,
        createdBy: ctx.userId,
      })
      .returning();
    const roles = r.requestedRoles && r.requestedRoles.length > 0 ? r.requestedRoles : [{ name: "Personal", count: r.headcount ?? 1 }];
    const qualList = await tx.select().from(qualifications).where(eq(qualifications.tenantId, ctx.tenantId));
    for (const role of roles) {
      const reqQ = (role.qualifications ?? []).map((k) => qualList.find((q) => q.key === k || q.name.toLowerCase() === k.toLowerCase())?.id).filter((x): x is string => Boolean(x));
      const [pos] = await tx
        .insert(positions)
        .values({ tenantId: ctx.tenantId, eventId: ev!.id, name: role.name, headcountRequired: role.count ?? 1, startsAt: r.startsAt!, endsAt: r.endsAt!, requiredQualificationIds: reqQ })
        .returning();
      await createOpenSlots(tx, ctx.tenantId, ev!.id, pos!.id, role.count ?? 1, r.startsAt!, r.endsAt!);
    }
    const orderNumber = await nextNumber(tx, "orders", "order_number", ctx.tenantId, "AU");
    const [order] = await tx.insert(orders).values({ tenantId: ctx.tenantId, orderNumber, customerId: customerId!, eventId: ev!.id, requestId: r.id, status: "draft" }).returning();
    await tx.update(customerRequests).set({ status: "converted", convertedEventId: ev!.id, customerId }).where(eq(customerRequests.id, id));
    await audit(tx, ctx, { action: "request.converted", entityType: "customer_request", entityId: id, after: { eventId: ev!.id, orderId: order!.id } });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "event.created", entityType: "event", entityId: ev!.id, payload: { id: ev!.id, name: ev!.name, customerId, startsAt: ev!.startsAt, endsAt: ev!.endsAt, status: ev!.status, requestId: id }, actorUserId: ctx.userId });
    return { event: ev!, order: order! };
  });
}

/** Legt `count` offene Schicht-Slots für eine Position an. */
export async function createOpenSlots(tx: Tx, tenantId: string, eventId: string, positionId: string, count: number, startsAt: Date, endsAt: Date, breakMinutes = 0) {
  if (count <= 0) return [];
  return tx
    .insert(shifts)
    .values(Array.from({ length: count }, () => ({ tenantId, eventId, positionId, startsAt, endsAt, breakMinutes, status: "open" as const })))
    .returning({ id: shifts.id });
}
