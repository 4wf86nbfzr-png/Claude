import { and, eq, gte, lt, lte, sql, isNull, desc, inArray } from "drizzle-orm";
import { withTenant } from "../../db/client";
import { shifts, events, customerRequests, reconciliationItems, employeeQualifications, documents, notifications, positions, customers, qualifications, employees } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { startOfDayUtc } from "@/lib/tz";
import { addDays } from "../../core/time";

export type DashboardData = {
  today: { date: string; events: number; shifts: number };
  upcoming7d: { events: number; shifts: number };
  openPositions: number;
  unconfirmedShifts: number;
  overdueResponses: number;
  newRequests: number;
  unhandledDeclines: number;
  missingTimeRecords: number;
  openDeviations: number;
  expiringQualifications: number;
  expiringDocuments: number;
  todayEvents: { id: string; name: string; customer: string; startsAt: Date; endsAt: Date; open: number; total: number }[];
  recentNotifications: { id: string; title: string; createdAt: Date; link: string | null; readAt: Date | null }[];
  warnings: { text: string; href: string; tone: "warn" | "danger" | "info" }[];
};

/** Alle Kennzahlen stammen aus Datenbankabfragen des angemeldeten Mandanten. */
export async function loadDashboard(ctx: AuthContext, now = new Date(), tz = "Europe/Berlin"): Promise<DashboardData> {
  requirePermission(ctx, "dashboard:view");
  const todayIso = new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(now);
  const dayStart = startOfDayUtc(todayIso, tz);
  const dayEnd = addDays(dayStart, 1);
  const in7 = addDays(dayStart, 8);
  const in30 = addDays(dayStart, 30);
  /** Veranstaltungen im Betrieb (für Tages-/Wochenlisten). */
  const activeEvent = inArray(events.status, ["planned", "confirmed", "in_progress"]);
  /** Veranstaltungen in Planung inkl. Entwürfe (für Besetzungs-Kennzahlen). */
  const workEvent = inArray(events.status, ["draft", "planned", "confirmed", "in_progress"]);

  return withTenant(ctx.tenantId, async (tx) => {
    const count = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0;
    const cnt = sql<number>`count(*)::int`;

    const todayEventsCount = count(tx.select({ c: cnt }).from(events).where(and(lt(events.startsAt, dayEnd), gte(events.endsAt, dayStart), activeEvent)));
    const todayShifts = count(
      tx
        .select({ c: cnt })
        .from(shifts)
        .where(and(lt(shifts.startsAt, dayEnd), gte(shifts.endsAt, dayStart), sql`${shifts.status} not in ('cancelled','replaced','withdrawn','declined')`)),
    );
    const upcomingEvents = count(tx.select({ c: cnt }).from(events).where(and(gte(events.startsAt, dayEnd), lt(events.startsAt, in7), activeEvent)));
    const upcomingShifts = count(tx.select({ c: cnt }).from(shifts).where(and(gte(shifts.startsAt, dayEnd), lt(shifts.startsAt, in7), sql`${shifts.status} not in ('cancelled','replaced')`)));
    const openPositions = count(
      tx
        .select({ c: cnt })
        .from(shifts)
        .innerJoin(events, eq(events.id, shifts.eventId))
        .where(and(eq(shifts.status, "open"), gte(shifts.startsAt, now), workEvent)),
    );
    const unconfirmed = count(
      tx
        .select({ c: cnt })
        .from(shifts)
        .innerJoin(events, eq(events.id, shifts.eventId))
        .where(and(inArray(shifts.status, ["requested", "accepted"]), gte(shifts.startsAt, now), workEvent)),
    );
    const overdue = count(tx.select({ c: cnt }).from(shifts).where(and(eq(shifts.status, "requested"), lte(shifts.responseDeadlineAt, now), gte(shifts.startsAt, now))));
    const newRequests = count(tx.select({ c: cnt }).from(customerRequests).where(inArray(customerRequests.status, ["new", "needs_info"])));
    // Absagen/Rückzüge/keine Rückmeldung, deren Ersatz-Slot noch unbesetzt ist
    const declines = count(
      tx
        .select({ c: cnt })
        .from(shifts)
        .innerJoin(events, eq(events.id, shifts.eventId))
        .where(
          and(
            inArray(shifts.status, ["declined", "withdrawn", "no_response"]),
            gte(shifts.startsAt, now),
            workEvent,
            sql`(${shifts.replacedByShiftId} is null or exists (select 1 from shifts r where r.id = ${shifts.replacedByShiftId} and r.status = 'open'))`,
          ),
        ),
    );
    // Fehlende Zeitnachweise: vergangene bestätigte Schichten ohne Abgleichseintrag mit Zeitnachweis
    const missing = count(
      tx
        .select({ c: cnt })
        .from(shifts)
        .leftJoin(reconciliationItems, eq(reconciliationItems.shiftId, shifts.id))
        .where(and(eq(shifts.status, "confirmed"), lt(shifts.endsAt, now), sql`(${reconciliationItems.id} is null or ${reconciliationItems.kind} = 'missing_record') and (${reconciliationItems.status} is null or ${reconciliationItems.status} = 'open')`)),
    );
    const deviations = count(tx.select({ c: cnt }).from(reconciliationItems).where(and(eq(reconciliationItems.status, "open"), inArray(reconciliationItems.kind, ["deviation", "unplanned_record"]))));
    const expQual = count(
      tx
        .select({ c: cnt })
        .from(employeeQualifications)
        .innerJoin(employees, eq(employees.id, employeeQualifications.employeeId))
        .where(and(eq(employees.status, "active"), sql`${employeeQualifications.validUntil} is not null`, lte(employeeQualifications.validUntil, in30.toISOString().slice(0, 10)))),
    );
    const expDocs = count(tx.select({ c: cnt }).from(documents).where(and(isNull(documents.deletedAt), sql`${documents.expiresAt} is not null`, lte(documents.expiresAt, in30.toISOString().slice(0, 10)))));

    const todayEventRows = await tx
      .select({ id: events.id, name: events.name, customer: customers.name, startsAt: events.startsAt, endsAt: events.endsAt })
      .from(events)
      .innerJoin(customers, eq(customers.id, events.customerId))
      .where(and(lt(events.startsAt, dayEnd), gte(events.endsAt, dayStart), activeEvent))
      .orderBy(events.startsAt)
      .limit(20);
    const todayEventsWithFill = [] as DashboardData["todayEvents"];
    for (const e of todayEventRows) {
      const [agg] = await tx
        .select({
          total: sql<number>`coalesce(sum(${positions.headcountRequired}),0)::int`,
        })
        .from(positions)
        .where(eq(positions.eventId, e.id));
      const [filled] = await tx
        .select({ c: cnt })
        .from(shifts)
        .where(and(eq(shifts.eventId, e.id), inArray(shifts.status, ["accepted", "confirmed"])));
      const total = agg?.total ?? 0;
      todayEventsWithFill.push({ ...e, total, open: Math.max(0, total - (filled?.c ?? 0)) });
    }

    const recent = ctx.userId
      ? await tx
          .select({ id: notifications.id, title: notifications.title, createdAt: notifications.createdAt, link: notifications.link, readAt: notifications.readAt })
          .from(notifications)
          .where(and(eq(notifications.userId, ctx.userId), eq(notifications.channel, "in_app")))
          .orderBy(desc(notifications.createdAt))
          .limit(8)
      : [];

    void qualifications;
    const [tE, tS, uE, uS, op, uc, od, nr, dc, mr, dv, eq30, ed30] = await Promise.all([
      todayEventsCount,
      todayShifts,
      upcomingEvents,
      upcomingShifts,
      openPositions,
      unconfirmed,
      overdue,
      newRequests,
      declines,
      missing,
      deviations,
      expQual,
      expDocs,
    ]);

    const warnings: DashboardData["warnings"] = [];
    if (od > 0) warnings.push({ text: `${od} Einsatzanfragen ohne Rückmeldung nach Fristablauf`, href: "/schichten?status=requested&ueberfaellig=1", tone: "danger" });
    if (dc > 0) warnings.push({ text: `${dc} Absagen/Rückzüge für kommende Einsätze noch nicht nachbesetzt`, href: "/schichten?status=declined", tone: "danger" });
    if (op > 0) warnings.push({ text: `${op} offene Positionen bei kommenden Veranstaltungen`, href: "/schichten?status=open", tone: "warn" });
    if (eq30 > 0) warnings.push({ text: `${eq30} Qualifikationen laufen in den nächsten 30 Tagen ab`, href: "/qualifikationen?ablauf=30", tone: "warn" });
    if (ed30 > 0) warnings.push({ text: `${ed30} Dokumente laufen in den nächsten 30 Tagen ab`, href: "/dokumente?ablauf=30", tone: "warn" });
    if (dv > 0) warnings.push({ text: `${dv} Abweichungen im Soll-Ist-Abgleich warten auf Prüfung`, href: "/abgleich?status=open", tone: "info" });

    return {
      today: { date: todayIso, events: tE, shifts: tS },
      upcoming7d: { events: uE, shifts: uS },
      openPositions: op,
      unconfirmedShifts: uc,
      overdueResponses: od,
      newRequests: nr,
      unhandledDeclines: dc,
      missingTimeRecords: mr,
      openDeviations: dv,
      expiringQualifications: eq30,
      expiringDocuments: ed30,
      todayEvents: todayEventsWithFill,
      recentNotifications: recent,
      warnings,
    };
  });
}
