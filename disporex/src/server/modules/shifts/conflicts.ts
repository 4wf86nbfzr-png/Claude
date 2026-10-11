import { and, eq, inArray, lt, gt, sql } from "drizzle-orm";
import type { Tx } from "../../db/client";
import { shifts, employees, employeeQualifications, qualifications, availabilities, events, positions } from "../../db/schema";
import { overlaps, minutesBetween } from "../../core/time";

export type ConflictType = "double_booking" | "missing_qualification" | "qualification_expired" | "unavailable" | "rest_time" | "max_duration" | "employee_inactive";

export type Conflict = {
  type: ConflictType;
  /** Harte Konflikte können nicht freigegeben werden. */
  hard: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export type ConflictRules = { minRestHours: number; maxShiftHours: number };

export const CONFLICT_LABELS: Record<ConflictType, string> = {
  double_booking: "Doppelbuchung",
  missing_qualification: "Qualifikation fehlt",
  qualification_expired: "Qualifikation abgelaufen",
  unavailable: "Nicht verfügbar",
  rest_time: "Ruhezeit unterschritten",
  max_duration: "Schichtdauer überschritten",
  employee_inactive: "Mitarbeiter inaktiv",
};

/**
 * Prüft, ob ein Mitarbeiter einer Schicht zugewiesen werden kann.
 * Gibt alle gefundenen Konflikte zurück (leer = keine). Die Ruhezeit-/Dauerregeln
 * sind Warnungen auf Basis der Mandantenkonfiguration, keine Rechtsprüfung.
 */
export async function detectConflicts(
  tx: Tx,
  tenantId: string,
  employeeId: string,
  shift: { id?: string | null; positionId: string; startsAt: Date; endsAt: Date },
  rules: ConflictRules,
): Promise<Conflict[]> {
  const out: Conflict[] = [];
  const emp = (await tx.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId))).limit(1))[0];
  if (!emp) return [{ type: "employee_inactive", hard: true, message: "Mitarbeiter nicht gefunden." }];
  if (emp.status !== "active") out.push({ type: "employee_inactive", hard: true, message: `Mitarbeiter ist ${emp.status === "inactive" ? "deaktiviert" : emp.status === "left" ? "ausgeschieden" : "noch Bewerber"}.` });

  // Doppelbuchung: überschneidende aktive Schichten desselben Mitarbeiters
  const others = await tx
    .select({ s: shifts, eventName: events.name })
    .from(shifts)
    .innerJoin(events, eq(events.id, shifts.eventId))
    .where(
      and(
        eq(shifts.tenantId, tenantId),
        eq(shifts.employeeId, employeeId),
        inArray(shifts.status, ["requested", "accepted", "confirmed"]),
        lt(shifts.startsAt, shift.endsAt),
        gt(shifts.endsAt, shift.startsAt),
        shift.id ? sql`${shifts.id} <> ${shift.id}` : sql`true`,
      ),
    );
  for (const o of others) {
    out.push({ type: "double_booking", hard: true, message: `Bereits eingeplant: ${o.eventName} (${o.s.startsAt.toISOString()} – ${o.s.endsAt.toISOString()})`, details: { shiftId: o.s.id, eventId: o.s.eventId } });
  }

  // Qualifikationen der Position
  const pos = (await tx.select().from(positions).where(eq(positions.id, shift.positionId)).limit(1))[0];
  if (pos && pos.requiredQualificationIds.length > 0) {
    const have = await tx
      .select({ qualificationId: employeeQualifications.qualificationId, validUntil: employeeQualifications.validUntil, name: qualifications.name })
      .from(employeeQualifications)
      .innerJoin(qualifications, eq(qualifications.id, employeeQualifications.qualificationId))
      .where(eq(employeeQualifications.employeeId, employeeId));
    const names = await tx.select({ id: qualifications.id, name: qualifications.name }).from(qualifications).where(inArray(qualifications.id, pos.requiredQualificationIds));
    const shiftDay = shift.startsAt.toISOString().slice(0, 10);
    for (const qid of pos.requiredQualificationIds) {
      const h = have.find((x) => x.qualificationId === qid);
      const name = names.find((n) => n.id === qid)?.name ?? "Qualifikation";
      if (!h) out.push({ type: "missing_qualification", hard: false, message: `Erforderliche Qualifikation fehlt: ${name}`, details: { qualificationId: qid } });
      else if (h.validUntil && h.validUntil < shiftDay) out.push({ type: "qualification_expired", hard: false, message: `${name} ist am Einsatztag abgelaufen (gültig bis ${h.validUntil}).`, details: { qualificationId: qid } });
    }
  }

  // Verfügbarkeit: explizite Abwesenheit im Zeitraum
  const away = await tx
    .select()
    .from(availabilities)
    .where(and(eq(availabilities.employeeId, employeeId), eq(availabilities.kind, "unavailable"), lt(availabilities.startsAt, shift.endsAt), gt(availabilities.endsAt, shift.startsAt)));
  for (const a of away) out.push({ type: "unavailable", hard: false, message: `Als nicht verfügbar eingetragen${a.note ? ` (${a.note})` : ""}.`, details: { availabilityId: a.id } });

  // Schichtdauer
  const durationH = minutesBetween(shift.startsAt, shift.endsAt) / 60;
  if (durationH > rules.maxShiftHours) out.push({ type: "max_duration", hard: false, message: `Schichtdauer ${durationH.toFixed(1)} h überschreitet die konfigurierten ${rules.maxShiftHours} h.` });

  // Ruhezeit zu benachbarten Schichten
  if (rules.minRestHours > 0) {
    const window = rules.minRestHours * 3_600_000;
    const neighbours = await tx
      .select({ s: shifts, eventName: events.name })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .where(
        and(
          eq(shifts.tenantId, tenantId),
          eq(shifts.employeeId, employeeId),
          inArray(shifts.status, ["requested", "accepted", "confirmed"]),
          lt(shifts.startsAt, new Date(shift.endsAt.getTime() + window)),
          gt(shifts.endsAt, new Date(shift.startsAt.getTime() - window)),
          shift.id ? sql`${shifts.id} <> ${shift.id}` : sql`true`,
        ),
      );
    for (const n of neighbours) {
      if (overlaps(n.s.startsAt, n.s.endsAt, shift.startsAt, shift.endsAt)) continue; // bereits als Doppelbuchung gemeldet
      const gap = n.s.endsAt <= shift.startsAt ? minutesBetween(n.s.endsAt, shift.startsAt) : minutesBetween(shift.endsAt, n.s.startsAt);
      if (gap < rules.minRestHours * 60) out.push({ type: "rest_time", hard: false, message: `Nur ${(gap / 60).toFixed(1)} h Ruhezeit zu „${n.eventName}“ (konfiguriert: ${rules.minRestHours} h).`, details: { shiftId: n.s.id } });
    }
  }
  return out;
}
