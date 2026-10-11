import { and, eq, sql, asc, desc, ilike, or, gte, lte, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "../../db/client";
import { events, positions, shifts, orders, customers, locations, customerContacts, employees, eventChanges, qualifications, partners, users, documents } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { emitEvent } from "../../core/events";
import { nextNumber } from "../../core/numbering";
import { toPage, offsetOf } from "../../core/pagination";
import { createOpenSlots } from "../requests/service";
import { eventInput, eventInputBase, positionInput, positionInputBase, eventListQuery, type EventInput, type PositionInput } from "./schema";
import { notifyUser } from "../notifications/service";
import { memberships } from "../../db/schema";

export type EventRow = typeof events.$inferSelect;
export const ACTIVE_EVENT_STATUSES = ["draft", "planned", "confirmed", "in_progress"] as const;
export const ACTIVE_SHIFT_STATUSES = ["requested", "accepted", "confirmed"] as const;

export function publicEvent(e: EventRow) {
  return {
    id: e.id,
    name: e.name,
    status: e.status,
    customerId: e.customerId,
    locationId: e.locationId,
    contactId: e.contactId,
    requestId: e.requestId,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    setupStartsAt: e.setupStartsAt,
    teardownEndsAt: e.teardownEndsAt,
    dresscode: e.dresscode,
    briefing: e.briefing,
    meetingPoint: e.meetingPoint,
    specialNotes: e.specialNotes,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export async function listEvents(ctx: AuthContext, query: Partial<z.infer<typeof eventListQuery>> = {}) {
  requirePermission(ctx, "events:read");
  const q = eventListQuery.parse(query);
  const conds = [eq(events.tenantId, ctx.tenantId)];
  if (ctx.role === "customer") conds.push(eq(events.customerId, ctx.customerId ?? "00000000-0000-0000-0000-000000000000"));
  if (q.status === "active") conds.push(inArray(events.status, [...ACTIVE_EVENT_STATUSES]));
  else if (q.status !== "all") conds.push(eq(events.status, q.status));
  if (q.customerId) conds.push(eq(events.customerId, q.customerId));
  if (q.locationId) conds.push(eq(events.locationId, q.locationId));
  if (q.from) conds.push(gte(events.endsAt, q.from));
  if (q.to) conds.push(lte(events.startsAt, q.to));
  if (q.q) conds.push(or(ilike(events.name, `%${q.q}%`), ilike(customers.name, `%${q.q}%`))!);
  const where = and(...conds);
  const col = { startsAt: events.startsAt, name: events.name, createdAt: events.createdAt, status: events.status }[q.sort];
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({
        e: events,
        customerName: customers.name,
        locationName: locations.name,
        required: sql<number>`(select coalesce(sum(p.headcount_required),0)::int from positions p where p.event_id = ${events.id})`,
        filled: sql<number>`(select count(*)::int from shifts s where s.event_id = ${events.id} and s.status in ('accepted','confirmed'))`,
        pending: sql<number>`(select count(*)::int from shifts s where s.event_id = ${events.id} and s.status = 'requested')`,
      })
      .from(events)
      .innerJoin(customers, eq(customers.id, events.customerId))
      .leftJoin(locations, eq(locations.id, events.locationId))
      .where(where)
      .orderBy(q.dir === "asc" ? asc(col) : desc(col))
      .limit(q.pageSize)
      .offset(offsetOf(q));
    const total = (await tx.select({ c: sql<number>`count(*)::int` }).from(events).innerJoin(customers, eq(customers.id, events.customerId)).where(where))[0]?.c ?? 0;
    return toPage(
      rows.map((r) => ({ ...r.e, customerName: r.customerName, locationName: r.locationName, required: r.required, filled: r.filled, pending: r.pending })),
      total,
      q,
    );
  });
}

export type ShiftWithEmployee = typeof shifts.$inferSelect & { employeeName: string | null; employeeNumber: string | null; partnerName: string | null };

export async function getEvent(ctx: AuthContext, id: string) {
  requirePermission(ctx, "events:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const row = (
      await tx
        .select({ e: events, customerName: customers.name, location: locations, contact: customerContacts })
        .from(events)
        .innerJoin(customers, eq(customers.id, events.customerId))
        .leftJoin(locations, eq(locations.id, events.locationId))
        .leftJoin(customerContacts, eq(customerContacts.id, events.contactId))
        .where(and(eq(events.id, id), eq(events.tenantId, ctx.tenantId)))
        .limit(1)
    )[0];
    if (!row) throw new NotFoundError("Veranstaltung nicht gefunden");
    if (ctx.role === "customer" && row.e.customerId !== ctx.customerId) throw new NotFoundError("Veranstaltung nicht gefunden");
    const pos = await tx.select().from(positions).where(eq(positions.eventId, id)).orderBy(asc(positions.startsAt), asc(positions.name));
    const sh = await tx
      .select({ s: shifts, employeeName: sql<string | null>`${employees.lastName} || ', ' || ${employees.firstName}`, employeeNumber: employees.employeeNumber, partnerName: partners.name })
      .from(shifts)
      .leftJoin(employees, eq(employees.id, shifts.employeeId))
      .leftJoin(partners, eq(partners.id, shifts.partnerId))
      .where(eq(shifts.eventId, id))
      .orderBy(asc(shifts.startsAt), asc(shifts.createdAt));
    const shiftsByPosition = new Map<string, ShiftWithEmployee[]>();
    for (const r of sh) shiftsByPosition.set(r.s.positionId, [...(shiftsByPosition.get(r.s.positionId) ?? []), { ...r.s, employeeName: r.employeeName, employeeNumber: r.employeeNumber, partnerName: r.partnerName }]);
    const quals = await tx.select({ id: qualifications.id, name: qualifications.name }).from(qualifications).where(eq(qualifications.tenantId, ctx.tenantId));
    const ord = (await tx.select().from(orders).where(eq(orders.eventId, id)).limit(1))[0] ?? null;
    const changes = await tx.select({ c: eventChanges, actor: users.name }).from(eventChanges).leftJoin(users, eq(users.id, eventChanges.actorUserId)).where(eq(eventChanges.eventId, id)).orderBy(desc(eventChanges.createdAt)).limit(50);
    const docs = await tx.select().from(documents).where(and(eq(documents.entityType, "event"), eq(documents.entityId, id), isNull(documents.deletedAt))).orderBy(desc(documents.createdAt));
    const positionsWithShifts = pos.map((p) => {
      const list = shiftsByPosition.get(p.id) ?? [];
      const filled = list.filter((s) => s.status === "accepted" || s.status === "confirmed").length;
      const pending = list.filter((s) => s.status === "requested").length;
      return { ...p, shifts: list, filled, pending, open: Math.max(0, p.headcountRequired - filled - pending), qualificationNames: p.requiredQualificationIds.map((qid) => quals.find((q) => q.id === qid)?.name ?? "?") };
    });
    return { event: row.e, customerName: row.customerName, location: row.location, contact: row.contact, positions: positionsWithShifts, order: ord, changes: changes.map((c) => ({ ...c.c, actor: c.actor })), documents: docs };
  });
}

export async function createEvent(ctx: AuthContext, input: EventInput): Promise<EventRow> {
  requirePermission(ctx, "events:write");
  const data = eventInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const c = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, data.customerId), eq(customers.tenantId, ctx.tenantId))).limit(1);
    if (!c[0]) throw new NotFoundError("Kunde nicht gefunden");
    const [row] = await tx.insert(events).values({ tenantId: ctx.tenantId, ...data, status: "draft", createdBy: ctx.userId }).returning();
    await audit(tx, ctx, { action: "event.created", entityType: "event", entityId: row!.id, after: row });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "event.created", entityType: "event", entityId: row!.id, payload: publicEvent(row!), actorUserId: ctx.userId });
    return row!;
  });
}

const TRACKED_FIELDS: (keyof EventRow)[] = ["name", "startsAt", "endsAt", "setupStartsAt", "teardownEndsAt", "locationId", "contactId", "dresscode", "briefing", "meetingPoint", "specialNotes"];

/**
 * Änderungen nach Bestätigung werden je Feld historisiert (event_changes) und
 * benötigen eine Begründung; zugeordnete Mitarbeiter werden bei Zeit-/Ortsänderung informiert.
 */
export async function updateEvent(ctx: AuthContext, id: string, input: Partial<EventInput>, reason?: string): Promise<EventRow> {
  requirePermission(ctx, "events:write");
  const data = eventInputBase.partial().parse(input);
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) throw new ValidationError("Ende muss nach Beginn liegen.");
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(events).where(and(eq(events.id, id), eq(events.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Veranstaltung nicht gefunden");
    if (before.status === "completed" || before.status === "cancelled") throw new ConflictError("Abgeschlossene oder abgesagte Veranstaltungen sind nicht änderbar.");
    const confirmed = before.status === "confirmed" || before.status === "in_progress";
    const changed = TRACKED_FIELDS.filter((f) => f in data && String((data as Record<string, unknown>)[f] ?? "") !== String(before[f] ?? ""));
    if (confirmed && changed.length && !reason?.trim()) throw new ValidationError("Nach Bestätigung ist für Änderungen eine Begründung erforderlich.");
    const [row] = await tx.update(events).set(data).where(eq(events.id, id)).returning();
    for (const f of changed) {
      await tx.insert(eventChanges).values({ tenantId: ctx.tenantId, eventId: id, actorUserId: ctx.userId, field: f, oldValue: before[f] == null ? null : String(before[f]), newValue: row![f] == null ? null : String(row![f]), reason: reason ?? null });
    }
    if (confirmed && changed.length) {
      await tx.update(orders).set({ status: "changed" }).where(and(eq(orders.eventId, id), eq(orders.status, "confirmed")));
    }
    await audit(tx, ctx, { action: "event.updated", entityType: "event", entityId: id, before, after: row, reason });
    if (changed.length) {
      await emitEvent(tx, { tenantId: ctx.tenantId, type: "event.updated", entityType: "event", entityId: id, payload: { ...publicEvent(row!), changedFields: changed }, actorUserId: ctx.userId });
      const timeOrPlace = changed.some((f) => ["startsAt", "endsAt", "locationId", "meetingPoint"].includes(f));
      if (timeOrPlace) await notifyAssignedEmployees(tx, ctx.tenantId, id, `Änderung: ${row!.name}`, `Zeit oder Ort der Veranstaltung wurden geändert. Bitte Einsatzdetails prüfen.${reason ? ` Grund: ${reason}` : ""}`);
    }
    return row!;
  });
}

async function notifyAssignedEmployees(tx: Tx, tenantId: string, eventId: string, title: string, body: string) {
  const rows = await tx
    .select({ userId: memberships.userId, shiftId: shifts.id })
    .from(shifts)
    .innerJoin(memberships, and(eq(memberships.employeeId, shifts.employeeId), eq(memberships.tenantId, tenantId)))
    .where(and(eq(shifts.eventId, eventId), inArray(shifts.status, [...ACTIVE_SHIFT_STATUSES])));
  for (const r of rows) {
    await notifyUser(tx, tenantId, { userId: r.userId, kind: "shift.changed", title, body, link: `/portal/mitarbeiter`, priority: "high", dedupeKey: `event.changed:${eventId}:${r.userId}:${Date.now() / 60000 | 0}` });
  }
}

const EVENT_TRANSITIONS: Record<string, string[]> = {
  draft: ["planned", "cancelled"],
  planned: ["confirmed", "draft", "cancelled"],
  confirmed: ["in_progress", "cancelled", "completed"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: ["draft"],
};

export async function setEventStatus(ctx: AuthContext, id: string, status: EventRow["status"], reason?: string): Promise<EventRow> {
  requirePermission(ctx, "events:write");
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(events).where(and(eq(events.id, id), eq(events.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError();
    if (!EVENT_TRANSITIONS[before.status]?.includes(status)) throw new ConflictError(`Übergang ${before.status} → ${status} ist nicht erlaubt.`);
    if (status === "confirmed") {
      requirePermission(ctx, "orders:confirm");
      const ord = (await tx.select().from(orders).where(eq(orders.eventId, id)).limit(1))[0];
      if (!ord || (ord.status !== "confirmed" && ord.status !== "changed")) throw new ConflictError("Die Veranstaltung kann erst bestätigt werden, wenn der Auftrag bestätigt ist.");
    }
    if (status === "cancelled" && !reason?.trim()) throw new ValidationError("Bitte Grund der Absage angeben.");
    const [row] = await tx.update(events).set({ status }).where(eq(events.id, id)).returning();
    if (status === "cancelled") {
      await notifyAssignedEmployees(tx, ctx.tenantId, id, `Abgesagt: ${before.name}`, `Die Veranstaltung wurde abgesagt. Grund: ${reason}`);
      await tx.update(shifts).set({ status: "cancelled" }).where(and(eq(shifts.eventId, id), inArray(shifts.status, ["open", "requested", "accepted", "confirmed"])));
      await tx.update(orders).set({ status: "cancelled" }).where(and(eq(orders.eventId, id), inArray(orders.status, ["draft", "offered", "confirmed", "changed"])));
      await emitEvent(tx, { tenantId: ctx.tenantId, type: "event.cancelled", entityType: "event", entityId: id, payload: { ...publicEvent(row!), reason }, actorUserId: ctx.userId });
    }
    if (status === "completed") await tx.update(orders).set({ status: "completed" }).where(and(eq(orders.eventId, id), inArray(orders.status, ["confirmed", "changed"])));
    await audit(tx, ctx, { action: "event.status_changed", entityType: "event", entityId: id, before: { status: before.status }, after: { status }, reason });
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Positionen
// ---------------------------------------------------------------------------
export async function createPosition(ctx: AuthContext, eventId: string, input: PositionInput) {
  requirePermission(ctx, "events:write");
  const data = positionInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const ev = (await tx.select().from(events).where(and(eq(events.id, eventId), eq(events.tenantId, ctx.tenantId))).limit(1))[0];
    if (!ev) throw new NotFoundError("Veranstaltung nicht gefunden");
    if (ev.status === "completed" || ev.status === "cancelled") throw new ConflictError("Veranstaltung ist abgeschlossen oder abgesagt.");
    await ensureQualificationsExist(tx, ctx.tenantId, data.requiredQualificationIds);
    const [pos] = await tx.insert(positions).values({ tenantId: ctx.tenantId, eventId, ...data }).returning();
    await createOpenSlots(tx, ctx.tenantId, eventId, pos!.id, data.headcountRequired, data.startsAt, data.endsAt, data.breakMinutes);
    await audit(tx, ctx, { action: "position.created", entityType: "position", entityId: pos!.id, after: pos });
    return pos!;
  });
}

async function ensureQualificationsExist(tx: Tx, tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  const found = await tx.select({ id: qualifications.id }).from(qualifications).where(and(eq(qualifications.tenantId, tenantId), inArray(qualifications.id, ids)));
  if (found.length !== new Set(ids).size) throw new ValidationError("Unbekannte Qualifikation in den Anforderungen.");
}

/**
 * Positionsänderung: mehr Bedarf → neue offene Slots; weniger Bedarf → offene Slots
 * entfernen (nie besetzte). Zeitänderung überträgt sich auf alle nicht abgeschlossenen Slots.
 */
export async function updatePosition(ctx: AuthContext, positionId: string, input: Partial<PositionInput>) {
  requirePermission(ctx, "events:write");
  const data = positionInputBase.partial().parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(positions).where(and(eq(positions.id, positionId), eq(positions.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Position nicht gefunden");
    const startsAt = data.startsAt ?? before.startsAt;
    const endsAt = data.endsAt ?? before.endsAt;
    if (endsAt <= startsAt) throw new ValidationError("Ende muss nach Beginn liegen.");
    if (data.requiredQualificationIds) await ensureQualificationsExist(tx, ctx.tenantId, data.requiredQualificationIds);
    const [row] = await tx.update(positions).set(data).where(eq(positions.id, positionId)).returning();
    const slotRows = await tx.select().from(shifts).where(eq(shifts.positionId, positionId));
    const active = slotRows.filter((s) => s.status === "open" || ACTIVE_SHIFT_STATUSES.includes(s.status as (typeof ACTIVE_SHIFT_STATUSES)[number]));
    const target = row!.headcountRequired;
    if (target > active.length) {
      await createOpenSlots(tx, ctx.tenantId, before.eventId, positionId, target - active.length, startsAt, endsAt, row!.breakMinutes);
    } else if (target < active.length) {
      const removable = active.filter((s) => s.status === "open").slice(0, active.length - target);
      if (removable.length < active.length - target) throw new ConflictError("Bedarf kann nicht unter die Zahl der bereits zugewiesenen Personen gesenkt werden. Bitte zuerst Zuweisungen zurückziehen.");
      await tx.delete(shifts).where(inArray(shifts.id, removable.map((s) => s.id)));
    }
    const timeChanged = startsAt.getTime() !== before.startsAt.getTime() || endsAt.getTime() !== before.endsAt.getTime();
    if (timeChanged) {
      await tx.update(shifts).set({ startsAt, endsAt }).where(and(eq(shifts.positionId, positionId), inArray(shifts.status, ["open", "requested", "accepted", "confirmed"])));
      const assigned = slotRows.filter((s) => s.employeeId && ACTIVE_SHIFT_STATUSES.includes(s.status as (typeof ACTIVE_SHIFT_STATUSES)[number]));
      for (const s of assigned) {
        const m = (await tx.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.employeeId, s.employeeId!))).limit(1))[0];
        if (m) await notifyUser(tx, ctx.tenantId, { userId: m.userId, kind: "shift.changed", title: "Einsatzzeit geändert", body: `Neue Zeit: ${startsAt.toISOString()} – ${endsAt.toISOString()}`, link: "/portal/mitarbeiter", priority: "high", dedupeKey: `shift.time:${s.id}:${startsAt.getTime()}` });
      }
    }
    await audit(tx, ctx, { action: "position.updated", entityType: "position", entityId: positionId, before, after: row });
    return row!;
  });
}

export async function deletePosition(ctx: AuthContext, positionId: string) {
  requirePermission(ctx, "events:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const assigned = (await tx.select({ c: sql<number>`count(*)::int` }).from(shifts).where(and(eq(shifts.positionId, positionId), inArray(shifts.status, [...ACTIVE_SHIFT_STATUSES]))))[0]?.c ?? 0;
    if (assigned > 0) throw new ConflictError("Position hat zugewiesene Personen. Bitte zuerst Zuweisungen zurückziehen.");
    const res = await tx.delete(positions).where(and(eq(positions.id, positionId), eq(positions.tenantId, ctx.tenantId))).returning({ id: positions.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "position.deleted", entityType: "position", entityId: positionId });
  });
}

// ---------------------------------------------------------------------------
// Aufträge
// ---------------------------------------------------------------------------
export async function ensureOrder(ctx: AuthContext, eventId: string) {
  requirePermission(ctx, "orders:write");
  return withTenant(ctx.tenantId, async (tx) => {
    const ev = (await tx.select().from(events).where(and(eq(events.id, eventId), eq(events.tenantId, ctx.tenantId))).limit(1))[0];
    if (!ev) throw new NotFoundError();
    const existing = (await tx.select().from(orders).where(eq(orders.eventId, eventId)).limit(1))[0];
    if (existing) return existing;
    const orderNumber = await nextNumber(tx, "orders", "order_number", ctx.tenantId, "AU");
    const [o] = await tx.insert(orders).values({ tenantId: ctx.tenantId, orderNumber, customerId: ev.customerId, eventId, requestId: ev.requestId, status: "draft" }).returning();
    await audit(tx, ctx, { action: "order.created", entityType: "order", entityId: o!.id, after: o });
    return o!;
  });
}

const ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ["offered", "confirmed", "cancelled"],
  offered: ["confirmed", "cancelled", "draft"],
  confirmed: ["changed", "cancelled", "completed"],
  changed: ["confirmed", "cancelled", "completed"],
  cancelled: ["draft"],
  completed: [],
};

export async function setOrderStatus(ctx: AuthContext, orderId: string, status: string, opts: { notes?: string; releaseToCustomer?: boolean } = {}) {
  requirePermission(ctx, status === "confirmed" ? "orders:confirm" : "orders:write");
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Auftrag nicht gefunden");
    if (!ORDER_TRANSITIONS[before.status]?.includes(status)) throw new ConflictError(`Übergang ${before.status} → ${status} ist nicht erlaubt.`);
    const [row] = await tx
      .update(orders)
      .set({
        status: status as typeof before.status,
        notes: opts.notes ?? before.notes,
        confirmedAt: status === "confirmed" ? new Date() : before.confirmedAt,
        confirmedBy: status === "confirmed" ? ctx.userId : before.confirmedBy,
        releasedToCustomerAt: opts.releaseToCustomer ? new Date() : before.releasedToCustomerAt,
      })
      .where(eq(orders.id, orderId))
      .returning();
    if (status === "confirmed" && before.eventId) {
      // Veranstaltung wird mit dem Auftrag verbindlich.
      await tx.update(events).set({ status: "confirmed" }).where(and(eq(events.id, before.eventId), inArray(events.status, ["draft", "planned"])));
      await emitEvent(tx, { tenantId: ctx.tenantId, type: "order.confirmed", entityType: "order", entityId: orderId, payload: { id: orderId, orderNumber: row!.orderNumber, eventId: before.eventId, customerId: before.customerId }, actorUserId: ctx.userId });
    }
    await audit(tx, ctx, { action: "order.status_changed", entityType: "order", entityId: orderId, before: { status: before.status }, after: { status }, reason: opts.notes });
    return row!;
  });
}

export async function listOrders(ctx: AuthContext, filter: { status?: string; customerId?: string } = {}) {
  requirePermission(ctx, "orders:read");
  const conds = [eq(orders.tenantId, ctx.tenantId)];
  if (ctx.role === "customer") {
    conds.push(eq(orders.customerId, ctx.customerId ?? "00000000-0000-0000-0000-000000000000"));
    conds.push(sql`${orders.releasedToCustomerAt} is not null`);
  }
  if (filter.status && filter.status !== "all") conds.push(eq(orders.status, filter.status as typeof orders.$inferSelect.status));
  if (filter.customerId) conds.push(eq(orders.customerId, filter.customerId));
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ o: orders, customerName: customers.name, eventName: events.name, eventStartsAt: events.startsAt })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(events, eq(events.id, orders.eventId))
      .where(and(...conds))
      .orderBy(desc(orders.createdAt))
      .limit(200),
  );
}
