import { and, eq, sql, asc, desc, gte, lte, inArray, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "../../db/client";
import { shifts, shiftStatusHistory, events, positions, employees, customers, locations, memberships, partners, type ShiftStatus } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission, requireAny } from "../../auth/context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { emitEvent } from "../../core/events";
import { toPage, offsetOf } from "../../core/pagination";
import { notifyUser, notifyRoles } from "../notifications/service";
import { detectConflicts, type Conflict } from "./conflicts";
import { effectiveSettings, getTenant } from "../tenants/service";
import { shiftListQuery, assignInput, respondInput, shiftTimesInput, SHIFT_STATUS_LABELS } from "./schema";
import { fmtRange } from "@/lib/format";

export type Shift = typeof shifts.$inferSelect;
export const ACTIVE: ShiftStatus[] = ["requested", "accepted", "confirmed"];

export function publicShift(s: Shift) {
  return {
    id: s.id,
    eventId: s.eventId,
    positionId: s.positionId,
    employeeId: s.employeeId,
    partnerId: s.partnerId,
    status: s.status,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    breakMinutes: s.breakMinutes,
    requestedAt: s.requestedAt,
    responseDeadlineAt: s.responseDeadlineAt,
    respondedAt: s.respondedAt,
    confirmedAt: s.confirmedAt,
    replacedByShiftId: s.replacedByShiftId,
    notes: s.notes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function history(tx: Tx, ctx: AuthContext, shift: Shift, to: ShiftStatus, reason?: string | null, employeeId?: string | null) {
  await tx.insert(shiftStatusHistory).values({ tenantId: ctx.tenantId, shiftId: shift.id, fromStatus: shift.status, toStatus: to, employeeId: employeeId ?? shift.employeeId, actorUserId: ctx.userId, actorLabel: ctx.userName, reason: reason ?? null });
}

async function loadShift(tx: Tx, tenantId: string, id: string) {
  const row = (
    await tx
      .select({ s: shifts, e: events, p: positions })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .innerJoin(positions, eq(positions.id, shifts.positionId))
      .where(and(eq(shifts.id, id), eq(shifts.tenantId, tenantId)))
      .limit(1)
  )[0];
  if (!row) throw new NotFoundError("Schicht nicht gefunden");
  return row;
}

async function employeeUserId(tx: Tx, tenantId: string, employeeId: string): Promise<string | null> {
  const m = (await tx.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.employeeId, employeeId), eq(memberships.status, "active"))).limit(1))[0];
  return m?.userId ?? null;
}

async function rulesFor(tenantId: string) {
  const t = await getTenant(tenantId);
  return effectiveSettings(t.settings);
}

/** Wenn eine Position vollständig besetzt ist, Ereignis auslösen. */
async function checkFilled(tx: Tx, ctx: AuthContext, positionId: string) {
  const p = (await tx.select().from(positions).where(eq(positions.id, positionId)).limit(1))[0];
  if (!p) return;
  const filled = (await tx.select({ c: sql<number>`count(*)::int` }).from(shifts).where(and(eq(shifts.positionId, positionId), inArray(shifts.status, ["accepted", "confirmed"]))))[0]?.c ?? 0;
  if (filled >= p.headcountRequired) {
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "shift.filled", entityType: "position", entityId: positionId, payload: { positionId, eventId: p.eventId, name: p.name, headcountRequired: p.headcountRequired, filled }, actorUserId: ctx.userId });
  }
}

/** Erzeugt nach Absage/Rückzug einen neuen offenen Slot und meldet die frei gewordene Position. */
async function reopenSlot(tx: Tx, ctx: AuthContext, shift: Shift, reasonLabel: string) {
  const [open] = await tx
    .insert(shifts)
    .values({ tenantId: ctx.tenantId, eventId: shift.eventId, positionId: shift.positionId, startsAt: shift.startsAt, endsAt: shift.endsAt, breakMinutes: shift.breakMinutes, status: "open" })
    .returning();
  await tx.update(shifts).set({ replacedByShiftId: open!.id }).where(eq(shifts.id, shift.id));
  const ev = (await tx.select({ name: events.name }).from(events).where(eq(events.id, shift.eventId)).limit(1))[0];
  const emp = shift.employeeId ? (await tx.select({ f: employees.firstName, l: employees.lastName }).from(employees).where(eq(employees.id, shift.employeeId)).limit(1))[0] : null;
  await emitEvent(tx, { tenantId: ctx.tenantId, type: "shift.opened", entityType: "shift", entityId: open!.id, payload: { ...publicShift(open!), reason: reasonLabel, previousShiftId: shift.id }, actorUserId: ctx.userId });
  await notifyRoles(tx, ctx.tenantId, ["dispatcher", "tenant_admin"], {
    kind: "shift.declined",
    title: `Position frei: ${ev?.name ?? "Veranstaltung"}`,
    body: `${emp ? `${emp.f} ${emp.l}` : "Ein Mitarbeiter"} – ${reasonLabel}. Einsatz ${fmtRange(shift.startsAt, shift.endsAt)}. Nachbesetzung erforderlich.`,
    link: `/veranstaltungen/${shift.eventId}`,
    priority: "high",
    dedupeKey: `shift.reopen:${shift.id}`,
  });
  return open!;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------
export async function listShifts(ctx: AuthContext, query: Partial<z.infer<typeof shiftListQuery>> = {}) {
  requireAny(ctx, "shifts:read", "portal:employee");
  const q = shiftListQuery.parse(query);
  const conds = [eq(shifts.tenantId, ctx.tenantId)];
  if (ctx.role === "employee") {
    // Mitarbeiter sehen nur eigene, freigegebene Einsätze
    conds.push(eq(shifts.employeeId, ctx.employeeId ?? "00000000-0000-0000-0000-000000000000"));
    conds.push(inArray(shifts.status, ["requested", "accepted", "confirmed", "declined", "withdrawn", "no_response"]));
  }
  if (q.status === "active") conds.push(inArray(shifts.status, ACTIVE));
  else if (q.status !== "all") conds.push(eq(shifts.status, q.status));
  if (q.from) conds.push(gte(shifts.endsAt, q.from));
  if (q.to) conds.push(lte(shifts.startsAt, q.to));
  if (q.employeeId) conds.push(eq(shifts.employeeId, q.employeeId));
  if (q.eventId) conds.push(eq(shifts.eventId, q.eventId));
  if (q.positionId) conds.push(eq(shifts.positionId, q.positionId));
  if (q.customerId) conds.push(eq(events.customerId, q.customerId));
  if (q.locationId) conds.push(eq(events.locationId, q.locationId));
  if (q.overdue) conds.push(and(eq(shifts.status, "requested"), lte(shifts.responseDeadlineAt, new Date()))!);
  if (q.q) conds.push(or(ilike(events.name, `%${q.q}%`), ilike(employees.lastName, `%${q.q}%`), ilike(employees.firstName, `%${q.q}%`), ilike(positions.name, `%${q.q}%`))!);
  const where = and(...conds);
  const col = { startsAt: shifts.startsAt, status: shifts.status, eventName: events.name, employeeName: employees.lastName }[q.sort];
  return withTenant(ctx.tenantId, async (tx) => {
    const base = tx
      .select({
        s: shifts,
        eventName: events.name,
        eventStatus: events.status,
        customerName: customers.name,
        locationName: locations.name,
        positionName: positions.name,
        employeeName: sql<string | null>`case when ${employees.id} is null then null else ${employees.lastName} || ', ' || ${employees.firstName} end`,
        employeeNumber: employees.employeeNumber,
        partnerName: partners.name,
      })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .innerJoin(positions, eq(positions.id, shifts.positionId))
      .innerJoin(customers, eq(customers.id, events.customerId))
      .leftJoin(locations, eq(locations.id, events.locationId))
      .leftJoin(employees, eq(employees.id, shifts.employeeId))
      .leftJoin(partners, eq(partners.id, shifts.partnerId))
      .where(where);
    const rows = await base.orderBy(q.dir === "asc" ? asc(col) : desc(col), asc(positions.name)).limit(q.pageSize).offset(offsetOf(q));
    const total =
      (
        await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(shifts)
          .innerJoin(events, eq(events.id, shifts.eventId))
          .innerJoin(positions, eq(positions.id, shifts.positionId))
          .leftJoin(employees, eq(employees.id, shifts.employeeId))
          .where(where)
      )[0]?.c ?? 0;
    return toPage(
      rows.map((r) => ({ ...r.s, eventName: r.eventName, eventStatus: r.eventStatus, customerName: r.customerName, locationName: r.locationName, positionName: r.positionName, employeeName: r.employeeName, employeeNumber: r.employeeNumber, partnerName: r.partnerName })),
      total,
      q,
    );
  });
}

export async function getShift(ctx: AuthContext, id: string) {
  requireAny(ctx, "shifts:read", "portal:employee");
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, id);
    if (ctx.role === "employee" && row.s.employeeId !== ctx.employeeId) throw new NotFoundError("Schicht nicht gefunden");
    const hist = await tx.select().from(shiftStatusHistory).where(eq(shiftStatusHistory.shiftId, id)).orderBy(desc(shiftStatusHistory.createdAt));
    const emp = row.s.employeeId ? (await tx.select().from(employees).where(eq(employees.id, row.s.employeeId)).limit(1))[0] : null;
    const cust = (await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, row.e.customerId)).limit(1))[0];
    const loc = row.e.locationId ? (await tx.select().from(locations).where(eq(locations.id, row.e.locationId)).limit(1))[0] : null;
    return { shift: row.s, event: row.e, position: row.p, employee: emp ?? null, customerName: cust?.name ?? "", location: loc ?? null, history: hist };
  });
}

/** Konfliktprüfung ohne Zuweisung (für Vorschau in der UI/API). */
export async function previewConflicts(ctx: AuthContext, shiftId: string, employeeId: string): Promise<Conflict[]> {
  requirePermission(ctx, "shifts:assign");
  const rules = await rulesFor(ctx.tenantId);
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    return detectConflicts(tx, ctx.tenantId, employeeId, { id: row.s.id, positionId: row.s.positionId, startsAt: row.s.startsAt, endsAt: row.s.endsAt }, rules);
  });
}

/** Mitarbeitervorschläge für eine Schicht: aktive Mitarbeiter mit Konfliktstatus. */
export async function suggestEmployees(ctx: AuthContext, shiftId: string, opts: { q?: string; limit?: number } = {}) {
  requirePermission(ctx, "shifts:assign");
  const rules = await rulesFor(ctx.tenantId);
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    const conds = [eq(employees.tenantId, ctx.tenantId), eq(employees.status, "active")];
    if (opts.q) conds.push(or(ilike(employees.firstName, `%${opts.q}%`), ilike(employees.lastName, `%${opts.q}%`), ilike(employees.employeeNumber, `%${opts.q}%`))!);
    const list = await tx.select().from(employees).where(and(...conds)).orderBy(asc(employees.lastName), asc(employees.firstName)).limit(opts.limit ?? 60);
    const out = [];
    for (const e of list) {
      const conflicts = await detectConflicts(tx, ctx.tenantId, e.id, { id: row.s.id, positionId: row.s.positionId, startsAt: row.s.startsAt, endsAt: row.s.endsAt }, rules);
      out.push({ employee: e, conflicts, hard: conflicts.some((c) => c.hard) });
    }
    out.sort((a, b) => Number(a.hard) - Number(b.hard) || a.conflicts.length - b.conflicts.length || a.employee.lastName.localeCompare(b.employee.lastName));
    return { shift: row.s, position: row.p, event: row.e, candidates: out };
  });
}

// ---------------------------------------------------------------------------
// Zuweisung und Rückmeldungen
// ---------------------------------------------------------------------------
export type AssignResult = { shift: Shift; conflicts: Conflict[] };

/**
 * Weist einen Mitarbeiter einem offenen Slot zu. Konflikte blockieren; weiche
 * Konflikte lassen sich mit Berechtigung und Begründung freigeben (protokolliert),
 * harte (Doppelbuchung, inaktiv) nie.
 */
export async function assignShift(ctx: AuthContext, shiftId: string, input: z.infer<typeof assignInput>): Promise<AssignResult> {
  requirePermission(ctx, "shifts:assign");
  const data = assignInput.parse(input);
  const rules = await rulesFor(ctx.tenantId);
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    const s = row.s;
    if (s.status !== "open") throw new ConflictError(`Slot ist nicht offen (Status: ${SHIFT_STATUS_LABELS[s.status]}).`);
    if (!["draft", "planned", "confirmed", "in_progress"].includes(row.e.status)) throw new ConflictError("Veranstaltung ist abgeschlossen oder abgesagt.");
    const conflicts = await detectConflicts(tx, ctx.tenantId, data.employeeId, { id: s.id, positionId: s.positionId, startsAt: s.startsAt, endsAt: s.endsAt }, rules);
    const hard = conflicts.filter((c) => c.hard);
    if (hard.length) throw new ConflictError(`Zuweisung nicht möglich: ${hard.map((c) => c.message).join(" ")}`, { conflicts });
    if (conflicts.length) {
      if (!ctx.permissions.has("shifts:override_conflict")) throw new ConflictError(`Konflikte: ${conflicts.map((c) => c.message).join(" ")} – Freigabe erfordert die Berechtigung shifts:override_conflict.`, { conflicts });
      if (!data.overrideReason?.trim()) throw new ConflictError(`Konflikte: ${conflicts.map((c) => c.message).join(" ")} – zur Freigabe ist eine Begründung erforderlich.`, { conflicts });
    }
    const direct = data.mode === "direct";
    const now = new Date();
    const deadline = new Date(now.getTime() + rules.responseDeadlineHours * 3_600_000);
    const [updated] = await tx
      .update(shifts)
      .set({
        employeeId: data.employeeId,
        status: direct ? "confirmed" : "requested",
        requestedAt: now,
        responseDeadlineAt: direct ? null : deadline,
        respondedAt: direct ? now : null,
        confirmedAt: direct ? now : null,
        confirmedBy: direct ? ctx.userId : null,
        releasedToEmployeeAt: now,
        notes: data.note ?? s.notes,
        conflictOverrideReason: conflicts.length ? data.overrideReason : null,
        conflictOverrideBy: conflicts.length ? ctx.userId : null,
        conflictOverrideAt: conflicts.length ? now : null,
      })
      .where(eq(shifts.id, s.id))
      .returning();
    await history(tx, ctx, s, updated!.status, conflicts.length ? `Konflikte freigegeben: ${conflicts.map((c) => c.type).join(", ")} – ${data.overrideReason}` : data.note, data.employeeId);
    await audit(tx, ctx, { action: direct ? "shift.assigned_direct" : "shift.requested", entityType: "shift", entityId: s.id, after: { employeeId: data.employeeId, conflicts: conflicts.map((c) => c.type) }, reason: data.overrideReason ?? data.note });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: direct ? "shift.confirmed" : "shift.requested", entityType: "shift", entityId: s.id, payload: publicShift(updated!), actorUserId: ctx.userId });
    const uid = await employeeUserId(tx, ctx.tenantId, data.employeeId);
    if (uid) {
      await notifyUser(tx, ctx.tenantId, {
        userId: uid,
        kind: "shift.request",
        title: direct ? `Einsatz bestätigt: ${row.e.name}` : `Einsatzanfrage: ${row.e.name}`,
        body: `${row.p.name} · ${fmtRange(s.startsAt, s.endsAt)}${direct ? "" : ` · Bitte bis ${deadline.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} antworten.`}${data.note ? `\n${data.note}` : ""}`,
        link: `/portal/mitarbeiter/${s.id}`,
        priority: "high",
        dedupeKey: `shift.request:${s.id}:${data.employeeId}`,
      });
    }
    if (direct) await checkFilled(tx, ctx, s.positionId);
    return { shift: updated!, conflicts };
  });
}

/** Rückmeldung des Mitarbeiters (Portal) oder stellvertretend durch die Disposition. */
export async function respondToShift(ctx: AuthContext, shiftId: string, input: z.infer<typeof respondInput>): Promise<Shift> {
  const data = respondInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    const s = row.s;
    const own = ctx.role === "employee" && ctx.employeeId && s.employeeId === ctx.employeeId;
    if (own) {
      if (!ctx.permissions.has("shifts:respond_own")) throw new ForbiddenError();
    } else {
      requirePermission(ctx, "shifts:assign");
    }
    if (s.status !== "requested" && !(s.status === "accepted" && data.response === "declined")) throw new ConflictError(`Rückmeldung nicht möglich (Status: ${SHIFT_STATUS_LABELS[s.status]}).`);
    if (data.response === "accepted" && s.responseDeadlineAt && s.responseDeadlineAt < new Date() && own) {
      throw new ConflictError("Die Rückmeldefrist ist abgelaufen. Bitte Disposition kontaktieren.");
    }
    const [updated] = await tx
      .update(shifts)
      .set({ status: data.response, respondedAt: new Date(), notes: data.note ? `${s.notes ? s.notes + "\n" : ""}Rückmeldung: ${data.note}` : s.notes })
      .where(eq(shifts.id, s.id))
      .returning();
    await history(tx, ctx, s, data.response, data.note);
    await audit(tx, ctx, { action: `shift.${data.response}`, entityType: "shift", entityId: s.id, after: { response: data.response, by: own ? "employee" : "dispatcher" }, reason: data.note });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: data.response === "accepted" ? "shift.accepted" : "shift.declined", entityType: "shift", entityId: s.id, payload: publicShift(updated!), actorUserId: ctx.userId });
    if (data.response === "declined") {
      await reopenSlot(tx, ctx, updated!, `Absage${data.note ? ` (${data.note})` : ""}`);
    } else {
      const emp = (await tx.select({ f: employees.firstName, l: employees.lastName }).from(employees).where(eq(employees.id, s.employeeId!)).limit(1))[0];
      await notifyRoles(tx, ctx.tenantId, ["dispatcher", "tenant_admin"], {
        kind: "shift.response",
        title: `Zusage: ${emp?.f ?? ""} ${emp?.l ?? ""} – ${row.e.name}`,
        body: `${row.p.name} · ${fmtRange(s.startsAt, s.endsAt)}. Bitte bestätigen.`,
        link: `/veranstaltungen/${s.eventId}`,
        priority: "normal",
        dedupeKey: `shift.accepted:${s.id}`,
      });
      await checkFilled(tx, ctx, s.positionId);
    }
    return updated!;
  });
}

/** Verbindliche Bestätigung einer Zusage durch die Disposition – prüft Konflikte erneut. */
export async function confirmShift(ctx: AuthContext, shiftId: string): Promise<Shift> {
  requirePermission(ctx, "shifts:assign");
  const rules = await rulesFor(ctx.tenantId);
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    const s = row.s;
    if (s.status !== "accepted") throw new ConflictError(`Nur zugesagte Einsätze können bestätigt werden (Status: ${SHIFT_STATUS_LABELS[s.status]}).`);
    const conflicts = await detectConflicts(tx, ctx.tenantId, s.employeeId!, { id: s.id, positionId: s.positionId, startsAt: s.startsAt, endsAt: s.endsAt }, rules);
    const blocking = conflicts.filter((c) => c.hard || !s.conflictOverrideReason);
    if (blocking.length) throw new ConflictError(`Bestätigung nicht möglich: ${blocking.map((c) => c.message).join(" ")}`, { conflicts });
    const [updated] = await tx.update(shifts).set({ status: "confirmed", confirmedAt: new Date(), confirmedBy: ctx.userId }).where(eq(shifts.id, s.id)).returning();
    await history(tx, ctx, s, "confirmed");
    await audit(tx, ctx, { action: "shift.confirmed", entityType: "shift", entityId: s.id });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "shift.confirmed", entityType: "shift", entityId: s.id, payload: publicShift(updated!), actorUserId: ctx.userId });
    const uid = await employeeUserId(tx, ctx.tenantId, s.employeeId!);
    if (uid) await notifyUser(tx, ctx.tenantId, { userId: uid, kind: "shift.request", title: `Einsatz bestätigt: ${row.e.name}`, body: `${row.p.name} · ${fmtRange(s.startsAt, s.endsAt)}`, link: `/portal/mitarbeiter/${s.id}`, priority: "normal", dedupeKey: `shift.confirmed:${s.id}` });
    return updated!;
  });
}

/** Zuweisung zurückziehen (Disposition) – Slot wird neu geöffnet. */
export async function withdrawShift(ctx: AuthContext, shiftId: string, reason: string): Promise<Shift> {
  requirePermission(ctx, "shifts:assign");
  if (!reason?.trim()) throw new ValidationError("Bitte Grund angeben.");
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    const s = row.s;
    if (!ACTIVE.includes(s.status)) throw new ConflictError(`Status ${SHIFT_STATUS_LABELS[s.status]} kann nicht zurückgezogen werden.`);
    const [updated] = await tx.update(shifts).set({ status: "withdrawn" }).where(eq(shifts.id, s.id)).returning();
    await history(tx, ctx, s, "withdrawn", reason);
    await audit(tx, ctx, { action: "shift.withdrawn", entityType: "shift", entityId: s.id, reason });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "shift.withdrawn", entityType: "shift", entityId: s.id, payload: { ...publicShift(updated!), reason }, actorUserId: ctx.userId });
    const uid = s.employeeId ? await employeeUserId(tx, ctx.tenantId, s.employeeId) : null;
    if (uid) await notifyUser(tx, ctx.tenantId, { userId: uid, kind: "shift.request", title: `Einsatz zurückgezogen: ${row.e.name}`, body: `${fmtRange(s.startsAt, s.endsAt)} – ${reason}`, link: "/portal/mitarbeiter", priority: "high", dedupeKey: `shift.withdrawn:${s.id}` });
    await reopenSlot(tx, ctx, updated!, `Zurückgezogen (${reason})`);
    return updated!;
  });
}

/** Offenen Slot entfernen (Bedarf sinkt) oder stornieren. */
export async function removeOpenSlot(ctx: AuthContext, shiftId: string): Promise<void> {
  requirePermission(ctx, "shifts:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    if (row.s.status !== "open") throw new ConflictError("Nur offene Slots können entfernt werden.");
    await tx.delete(shifts).where(eq(shifts.id, shiftId));
    const remaining = (await tx.select({ c: sql<number>`count(*)::int` }).from(shifts).where(and(eq(shifts.positionId, row.p.id), inArray(shifts.status, ["open", ...ACTIVE]))))[0]?.c ?? 0;
    await tx.update(positions).set({ headcountRequired: Math.max(remaining, 0) }).where(eq(positions.id, row.p.id));
    await audit(tx, ctx, { action: "shift.slot_removed", entityType: "shift", entityId: shiftId });
  });
}

/** Zeiten einer einzelnen Schicht ändern (Verschiebung). */
export async function updateShiftTimes(ctx: AuthContext, shiftId: string, input: z.infer<typeof shiftTimesInput>): Promise<{ shift: Shift; conflicts: Conflict[] }> {
  requirePermission(ctx, "shifts:write");
  const data = shiftTimesInput.parse(input);
  const rules = await rulesFor(ctx.tenantId);
  return withTenant(ctx.tenantId, async (tx) => {
    const row = await loadShift(tx, ctx.tenantId, shiftId);
    const s = row.s;
    if (!["open", ...ACTIVE].includes(s.status)) throw new ConflictError("Diese Schicht ist nicht mehr änderbar.");
    let conflicts: Conflict[] = [];
    if (s.employeeId && ACTIVE.includes(s.status)) {
      conflicts = await detectConflicts(tx, ctx.tenantId, s.employeeId, { id: s.id, positionId: s.positionId, startsAt: data.startsAt, endsAt: data.endsAt }, rules);
      const hard = conflicts.filter((c) => c.hard);
      if (hard.length) throw new ConflictError(`Verschiebung nicht möglich: ${hard.map((c) => c.message).join(" ")}`, { conflicts });
      if (conflicts.length && !data.reason?.trim()) throw new ConflictError(`Konflikte: ${conflicts.map((c) => c.message).join(" ")} – bitte Begründung angeben.`, { conflicts });
    }
    const [updated] = await tx.update(shifts).set({ startsAt: data.startsAt, endsAt: data.endsAt, breakMinutes: data.breakMinutes ?? s.breakMinutes }).where(eq(shifts.id, s.id)).returning();
    await tx.insert(shiftStatusHistory).values({ tenantId: ctx.tenantId, shiftId: s.id, fromStatus: s.status, toStatus: s.status, employeeId: s.employeeId, actorUserId: ctx.userId, actorLabel: ctx.userName, reason: `Zeit geändert: ${fmtRange(s.startsAt, s.endsAt)} → ${fmtRange(data.startsAt, data.endsAt)}${data.reason ? ` (${data.reason})` : ""}` });
    await audit(tx, ctx, { action: "shift.times_changed", entityType: "shift", entityId: s.id, before: { startsAt: s.startsAt, endsAt: s.endsAt }, after: { startsAt: data.startsAt, endsAt: data.endsAt }, reason: data.reason });
    if (s.employeeId && ACTIVE.includes(s.status)) {
      const uid = await employeeUserId(tx, ctx.tenantId, s.employeeId);
      if (uid) await notifyUser(tx, ctx.tenantId, { userId: uid, kind: "shift.request", title: `Einsatzzeit geändert: ${row.e.name}`, body: `Neu: ${fmtRange(data.startsAt, data.endsAt)}${data.reason ? ` – ${data.reason}` : ""}`, link: `/portal/mitarbeiter/${s.id}`, priority: "high", dedupeKey: `shift.times:${s.id}:${data.startsAt.getTime()}` });
    }
    return { shift: updated!, conflicts };
  });
}

/** Worker: Anfragen ohne Rückmeldung nach Fristablauf als „keine Rückmeldung“ markieren und Slot neu öffnen. */
export async function expireUnansweredRequests(ctx: AuthContext): Promise<number> {
  return withTenant(ctx.tenantId, async (tx) => {
    const due = await tx.select().from(shifts).where(and(eq(shifts.tenantId, ctx.tenantId), eq(shifts.status, "requested"), lte(shifts.responseDeadlineAt, new Date())));
    for (const s of due) {
      const [u] = await tx.update(shifts).set({ status: "no_response" }).where(eq(shifts.id, s.id)).returning();
      await history(tx, ctx, s, "no_response", "Frist abgelaufen");
      await emitEvent(tx, { tenantId: ctx.tenantId, type: "shift.declined", entityType: "shift", entityId: s.id, payload: { ...publicShift(u!), reason: "no_response" } });
      await reopenSlot(tx, ctx, u!, "keine Rückmeldung bis Fristablauf");
    }
    return due.length;
  });
}

/** Worker: Erinnerung an offene Anfragen, deren Frist in weniger als 6 Stunden endet. */
export async function remindPendingRequests(ctx: AuthContext): Promise<number> {
  return withTenant(ctx.tenantId, async (tx) => {
    const soon = new Date(Date.now() + 6 * 3_600_000);
    const rows = await tx
      .select({ s: shifts, eventName: events.name })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .where(and(eq(shifts.tenantId, ctx.tenantId), eq(shifts.status, "requested"), lte(shifts.responseDeadlineAt, soon), gte(shifts.responseDeadlineAt, new Date())));
    let n = 0;
    for (const r of rows) {
      const uid = r.s.employeeId ? await employeeUserId(tx, ctx.tenantId, r.s.employeeId) : null;
      if (!uid) continue;
      const id = await notifyUser(tx, ctx.tenantId, { userId: uid, kind: "shift.request", title: `Erinnerung: Rückmeldung zu ${r.eventName}`, body: `Bitte bis ${r.s.responseDeadlineAt!.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} zu- oder absagen.`, link: `/portal/mitarbeiter/${r.s.id}`, priority: "high", dedupeKey: `shift.remind:${r.s.id}` });
      if (id) n++;
    }
    return n;
  });
}

// ---------------------------------------------------------------------------
// Kalender
// ---------------------------------------------------------------------------
export async function calendarRange(ctx: AuthContext, from: Date, to: Date, filter: { customerId?: string; employeeId?: string; locationId?: string; status?: string } = {}) {
  requirePermission(ctx, "shifts:read");
  const evConds = [eq(events.tenantId, ctx.tenantId), lte(events.startsAt, to), gte(events.endsAt, from), inArray(events.status, ["draft", "planned", "confirmed", "in_progress", "completed"])];
  if (filter.customerId) evConds.push(eq(events.customerId, filter.customerId));
  if (filter.locationId) evConds.push(eq(events.locationId, filter.locationId));
  if (filter.status && filter.status !== "all") evConds.push(eq(events.status, filter.status as typeof events.$inferSelect.status));
  return withTenant(ctx.tenantId, async (tx) => {
    const evs = await tx
      .select({
        e: events,
        customerName: customers.name,
        locationName: locations.name,
        required: sql<number>`(select coalesce(sum(p.headcount_required),0)::int from positions p where p.event_id = ${events.id})`,
        filled: sql<number>`(select count(*)::int from shifts s where s.event_id = ${events.id} and s.status in ('accepted','confirmed'))`,
        pending: sql<number>`(select count(*)::int from shifts s where s.event_id = ${events.id} and s.status = 'requested')`,
        open: sql<number>`(select count(*)::int from shifts s where s.event_id = ${events.id} and s.status = 'open')`,
      })
      .from(events)
      .innerJoin(customers, eq(customers.id, events.customerId))
      .leftJoin(locations, eq(locations.id, events.locationId))
      .where(and(...evConds))
      .orderBy(asc(events.startsAt));
    const shConds = [eq(shifts.tenantId, ctx.tenantId), lte(shifts.startsAt, to), gte(shifts.endsAt, from), inArray(shifts.status, ["open", ...ACTIVE])];
    if (filter.employeeId) shConds.push(eq(shifts.employeeId, filter.employeeId));
    const sh = await tx
      .select({ s: shifts, eventName: events.name, positionName: positions.name, employeeName: sql<string | null>`case when ${employees.id} is null then null else ${employees.lastName} || ', ' || ${employees.firstName} end` })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .innerJoin(positions, eq(positions.id, shifts.positionId))
      .leftJoin(employees, eq(employees.id, shifts.employeeId))
      .where(and(...shConds, filter.customerId ? eq(events.customerId, filter.customerId) : sql`true`))
      .orderBy(asc(shifts.startsAt));
    return {
      events: evs.map((r) => ({ ...r.e, customerName: r.customerName, locationName: r.locationName, required: r.required, filled: r.filled, pending: r.pending, open: r.open })),
      shifts: sh.map((r) => ({ ...r.s, eventName: r.eventName, positionName: r.positionName, employeeName: r.employeeName })),
    };
  });
}
