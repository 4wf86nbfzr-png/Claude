import { and, eq, sql, gte, lte, inArray, isNull, isNotNull, desc } from "drizzle-orm";
import { withTenant } from "../../db/client";
import { shifts, events, positions, customers, employees, reconciliationItems, documents, employeeQualifications, qualifications, orders, shiftStatusHistory } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import { audit } from "../../core/audit";

export type Range = { from: Date; to: Date };

export type ReportKey = "staffing" | "responses" | "hours" | "deviations" | "customers" | "expiring" | "demand" | "orders";
export const REPORT_LABELS: Record<ReportKey, string> = {
  staffing: "Besetzungsquote und offene Positionen",
  responses: "Rückmeldequote",
  hours: "Geplante und bestätigte Stunden",
  deviations: "Abweichungen bei Arbeitszeiten",
  customers: "Einsätze je Kunde",
  expiring: "Ablaufende Dokumente und Qualifikationen",
  demand: "Entwicklung des Personalbedarfs (wöchentlich)",
  orders: "Auftragsübersicht",
};

export type ReportResult = {
  key: ReportKey;
  title: string;
  range: Range;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string | number | null>[];
  summary: Record<string, string | number>;
  /** Vorläufig, wenn offene Prüfungen oder ungeplante Veranstaltungen im Zeitraum liegen. */
  preliminary: boolean;
  notes: string[];
};

const cnt = sql<number>`count(*)::int`;
const activeEvent = inArray(events.status, ["planned", "confirmed", "in_progress", "completed"]);

/** Alle Berichte werden aus denselben Tabellen berechnet wie die operativen Ansichten – keine separaten Zähler. */
export async function runReport(ctx: AuthContext, key: ReportKey, range: Range): Promise<ReportResult> {
  requirePermission(ctx, "reports:view");
  if (range.to <= range.from) throw new Error("Ungültiger Zeitraum");
  const inRange = and(gte(events.startsAt, range.from), lte(events.startsAt, range.to));
  return withTenant(ctx.tenantId, async (tx): Promise<ReportResult> => {
    const notes: string[] = [];
    switch (key) {
      case "staffing": {
        const rows = await tx
          .select({
            eventId: events.id,
            event: events.name,
            customer: customers.name,
            startsAt: events.startsAt,
            status: events.status,
            required: sql<number>`(select coalesce(sum(p.headcount_required),0)::int from positions p where p.event_id = ${events.id})`,
            filled: sql<number>`(select count(*)::int from shifts s where s.event_id = ${events.id} and s.status in ('accepted','confirmed'))`,
            open: sql<number>`(select count(*)::int from shifts s where s.event_id = ${events.id} and s.status = 'open')`,
          })
          .from(events)
          .innerJoin(customers, eq(customers.id, events.customerId))
          .where(and(eq(events.tenantId, ctx.tenantId), inRange, activeEvent))
          .orderBy(events.startsAt);
        const req = rows.reduce((a, r) => a + r.required, 0);
        const fil = rows.reduce((a, r) => a + r.filled, 0);
        const open = rows.reduce((a, r) => a + r.open, 0);
        const draft = (await tx.select({ c: cnt }).from(events).where(and(eq(events.tenantId, ctx.tenantId), inRange, eq(events.status, "draft"))))[0]?.c ?? 0;
        if (draft) notes.push(`${draft} Entwürfe im Zeitraum nicht enthalten.`);
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "startsAt", label: "Datum" }, { key: "event", label: "Veranstaltung" }, { key: "customer", label: "Kunde" }, { key: "status", label: "Status" }, { key: "required", label: "Bedarf", numeric: true }, { key: "filled", label: "Besetzt", numeric: true }, { key: "open", label: "Offen", numeric: true }, { key: "rate", label: "Quote %", numeric: true }],
          rows: rows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), rate: r.required ? Math.round((r.filled / r.required) * 100) : null })),
          summary: { Veranstaltungen: rows.length, Bedarf: req, Besetzt: fil, Offen: open, "Besetzungsquote %": req ? Math.round((fil / req) * 100) : 0 },
          preliminary: rows.some((r) => r.status !== "completed"),
          notes,
        };
      }
      case "responses": {
        const hist = await tx
          .select({ to: shiftStatusHistory.toStatus, c: cnt })
          .from(shiftStatusHistory)
          .where(and(eq(shiftStatusHistory.tenantId, ctx.tenantId), gte(shiftStatusHistory.createdAt, range.from), lte(shiftStatusHistory.createdAt, range.to), inArray(shiftStatusHistory.toStatus, ["requested", "accepted", "declined", "no_response"])))
          .groupBy(shiftStatusHistory.toStatus);
        const g = (s: string) => hist.find((h) => h.to === s)?.c ?? 0;
        const answered = g("accepted") + g("declined");
        const total = answered + g("no_response");
        const perEmp = await tx
          .select({ employee: sql<string>`${employees.lastName} || ', ' || ${employees.firstName}`, accepted: sql<number>`sum(case when ${shiftStatusHistory.toStatus}='accepted' then 1 else 0 end)::int`, declined: sql<number>`sum(case when ${shiftStatusHistory.toStatus}='declined' then 1 else 0 end)::int`, noResponse: sql<number>`sum(case when ${shiftStatusHistory.toStatus}='no_response' then 1 else 0 end)::int` })
          .from(shiftStatusHistory)
          .innerJoin(employees, eq(employees.id, shiftStatusHistory.employeeId))
          .where(and(eq(shiftStatusHistory.tenantId, ctx.tenantId), gte(shiftStatusHistory.createdAt, range.from), lte(shiftStatusHistory.createdAt, range.to), inArray(shiftStatusHistory.toStatus, ["accepted", "declined", "no_response"])))
          .groupBy(employees.id, employees.lastName, employees.firstName)
          .orderBy(employees.lastName);
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "employee", label: "Mitarbeiter" }, { key: "accepted", label: "Zusagen", numeric: true }, { key: "declined", label: "Absagen", numeric: true }, { key: "noResponse", label: "Keine Rückmeldung", numeric: true }, { key: "rate", label: "Rückmeldequote %", numeric: true }],
          rows: perEmp.map((r) => ({ ...r, rate: r.accepted + r.declined + r.noResponse ? Math.round(((r.accepted + r.declined) / (r.accepted + r.declined + r.noResponse)) * 100) : null })),
          summary: { Anfragen: g("requested"), Zusagen: g("accepted"), Absagen: g("declined"), "Keine Rückmeldung": g("no_response"), "Rückmeldequote %": total ? Math.round((answered / total) * 100) : 0, "Zusagequote %": answered ? Math.round((g("accepted") / answered) * 100) : 0 },
          preliminary: g("requested") > answered + g("no_response"),
          notes: ["Rückmeldequote = (Zusagen + Absagen) / (Zusagen + Absagen + ohne Rückmeldung)."],
        };
      }
      case "hours": {
        const rows = await tx
          .select({
            employee: sql<string>`${employees.lastName} || ', ' || ${employees.firstName}`,
            employeeNumber: employees.employeeNumber,
            plannedMin: sql<number>`coalesce(sum(case when ${shifts.status} in ('requested','accepted','confirmed') then extract(epoch from (${shifts.endsAt} - ${shifts.startsAt}))/60 - ${shifts.breakMinutes} else 0 end),0)::int`,
            confirmedMin: sql<number>`coalesce(sum(case when ${shifts.status} = 'confirmed' then extract(epoch from (${shifts.endsAt} - ${shifts.startsAt}))/60 - ${shifts.breakMinutes} else 0 end),0)::int`,
            approvedMin: sql<number>`coalesce(sum(case when ${reconciliationItems.status} = 'approved' and ${reconciliationItems.approvedStart} is not null then extract(epoch from (${reconciliationItems.approvedEnd} - ${reconciliationItems.approvedStart}))/60 - coalesce(${reconciliationItems.approvedBreakMinutes},0) else 0 end),0)::int`,
            shiftsCount: sql<number>`count(distinct ${shifts.id})::int`,
          })
          .from(shifts)
          .innerJoin(employees, eq(employees.id, shifts.employeeId))
          .leftJoin(reconciliationItems, eq(reconciliationItems.shiftId, shifts.id))
          .where(and(eq(shifts.tenantId, ctx.tenantId), gte(shifts.startsAt, range.from), lte(shifts.startsAt, range.to)))
          .groupBy(employees.id, employees.lastName, employees.firstName, employees.employeeNumber)
          .orderBy(employees.lastName);
        const sum = (k: "plannedMin" | "confirmedMin" | "approvedMin") => rows.reduce((a, r) => a + r[k], 0);
        const openRecon = (await tx.select({ c: cnt }).from(reconciliationItems).innerJoin(shifts, eq(shifts.id, reconciliationItems.shiftId)).where(and(eq(reconciliationItems.tenantId, ctx.tenantId), eq(reconciliationItems.status, "open"), gte(shifts.startsAt, range.from), lte(shifts.startsAt, range.to))))[0]?.c ?? 0;
        if (openRecon) notes.push(`${openRecon} Abgleichseinträge im Zeitraum sind noch offen – bestätigte Ist-Stunden sind unvollständig.`);
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "employee", label: "Mitarbeiter" }, { key: "employeeNumber", label: "ID" }, { key: "shiftsCount", label: "Schichten", numeric: true }, { key: "plannedH", label: "Geplant (h)", numeric: true }, { key: "confirmedH", label: "Bestätigt geplant (h)", numeric: true }, { key: "approvedH", label: "Ist bestätigt (h)", numeric: true }],
          rows: rows.map((r) => ({ employee: r.employee, employeeNumber: r.employeeNumber, shiftsCount: r.shiftsCount, plannedH: +(r.plannedMin / 60).toFixed(2), confirmedH: +(r.confirmedMin / 60).toFixed(2), approvedH: +(r.approvedMin / 60).toFixed(2) })),
          summary: { "Geplant (h)": +(sum("plannedMin") / 60).toFixed(1), "Bestätigt geplant (h)": +(sum("confirmedMin") / 60).toFixed(1), "Ist bestätigt (h)": +(sum("approvedMin") / 60).toFixed(1) },
          preliminary: openRecon > 0,
          notes,
        };
      }
      case "deviations": {
        const rows = await tx
          .select({ kind: reconciliationItems.kind, status: reconciliationItems.status, c: cnt, dev: sql<number>`coalesce(sum(${reconciliationItems.deviationMinutes}),0)::int`, absDev: sql<number>`coalesce(sum(abs(${reconciliationItems.deviationMinutes})),0)::int` })
          .from(reconciliationItems)
          .where(and(eq(reconciliationItems.tenantId, ctx.tenantId), gte(sql`coalesce(${reconciliationItems.plannedStart}, ${reconciliationItems.actualStart})`, range.from), lte(sql`coalesce(${reconciliationItems.plannedStart}, ${reconciliationItems.actualStart})`, range.to)))
          .groupBy(reconciliationItems.kind, reconciliationItems.status);
        const open = rows.filter((r) => r.status === "open").reduce((a, r) => a + r.c, 0);
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "kind", label: "Art" }, { key: "status", label: "Status" }, { key: "c", label: "Anzahl", numeric: true }, { key: "devH", label: "Abweichung netto (h)", numeric: true }, { key: "absDevH", label: "Abweichung absolut (h)", numeric: true }],
          rows: rows.map((r) => ({ kind: r.kind, status: r.status, c: r.c, devH: +(r.dev / 60).toFixed(2), absDevH: +(r.absDev / 60).toFixed(2) })),
          summary: { Einträge: rows.reduce((a, r) => a + r.c, 0), Offen: open, "Abweichung netto (h)": +(rows.reduce((a, r) => a + r.dev, 0) / 60).toFixed(1) },
          preliminary: open > 0,
          notes: [],
        };
      }
      case "customers": {
        const rows = await tx
          .select({ customer: customers.name, customerNumber: customers.customerNumber, eventsCount: sql<number>`count(distinct ${events.id})::int`, shiftsCount: sql<number>`count(${shifts.id})::int`, plannedMin: sql<number>`coalesce(sum(extract(epoch from (${shifts.endsAt} - ${shifts.startsAt}))/60 - ${shifts.breakMinutes}),0)::int` })
          .from(events)
          .innerJoin(customers, eq(customers.id, events.customerId))
          .leftJoin(shifts, and(eq(shifts.eventId, events.id), inArray(shifts.status, ["accepted", "confirmed"])))
          .where(and(eq(events.tenantId, ctx.tenantId), inRange, activeEvent))
          .groupBy(customers.id, customers.name, customers.customerNumber)
          .orderBy(desc(sql`count(distinct ${events.id})`));
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "customer", label: "Kunde" }, { key: "customerNumber", label: "Nummer" }, { key: "eventsCount", label: "Veranstaltungen", numeric: true }, { key: "shiftsCount", label: "Besetzte Schichten", numeric: true }, { key: "plannedH", label: "Geplante Stunden", numeric: true }],
          rows: rows.map((r) => ({ customer: r.customer, customerNumber: r.customerNumber, eventsCount: r.eventsCount, shiftsCount: r.shiftsCount, plannedH: +(r.plannedMin / 60).toFixed(1) })),
          summary: { Kunden: rows.length, Veranstaltungen: rows.reduce((a, r) => a + r.eventsCount, 0) },
          preliminary: false,
          notes: [],
        };
      }
      case "expiring": {
        const limit = range.to.toISOString().slice(0, 10);
        const docs = await tx.select({ title: documents.title, entityType: documents.entityType, expiresAt: documents.expiresAt }).from(documents).where(and(eq(documents.tenantId, ctx.tenantId), isNull(documents.deletedAt), isNotNull(documents.expiresAt), lte(documents.expiresAt, limit))).orderBy(documents.expiresAt);
        const quals = await tx
          .select({ employee: sql<string>`${employees.lastName} || ', ' || ${employees.firstName}`, qualification: qualifications.name, validUntil: employeeQualifications.validUntil })
          .from(employeeQualifications)
          .innerJoin(employees, eq(employees.id, employeeQualifications.employeeId))
          .innerJoin(qualifications, eq(qualifications.id, employeeQualifications.qualificationId))
          .where(and(eq(employeeQualifications.tenantId, ctx.tenantId), eq(employees.status, "active"), isNotNull(employeeQualifications.validUntil), lte(employeeQualifications.validUntil, limit)))
          .orderBy(employeeQualifications.validUntil);
        const today = new Date().toISOString().slice(0, 10);
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "type", label: "Art" }, { key: "subject", label: "Betrifft" }, { key: "item", label: "Dokument / Qualifikation" }, { key: "expiresAt", label: "Gültig bis" }, { key: "state", label: "Zustand" }],
          rows: [
            ...docs.map((d) => ({ type: "Dokument", subject: d.entityType, item: d.title, expiresAt: d.expiresAt, state: d.expiresAt! < today ? "abgelaufen" : "läuft ab" })),
            ...quals.map((q) => ({ type: "Qualifikation", subject: q.employee, item: q.qualification, expiresAt: q.validUntil, state: q.validUntil! < today ? "abgelaufen" : "läuft ab" })),
          ],
          summary: { Dokumente: docs.length, Qualifikationen: quals.length },
          preliminary: false,
          notes: [`Bis ${limit}, einschließlich bereits abgelaufener Einträge.`],
        };
      }
      case "demand": {
        const rows = await tx
          .select({ week: sql<string>`to_char(date_trunc('week', ${positions.startsAt} at time zone 'Europe/Berlin'), 'IYYY-"KW"IW')`, required: sql<number>`coalesce(sum(${positions.headcountRequired}),0)::int`, positionsCount: cnt, filled: sql<number>`(select count(*)::int from shifts s where s.position_id = any(array_agg(${positions.id})) and s.status in ('accepted','confirmed'))` })
          .from(positions)
          .innerJoin(events, eq(events.id, positions.eventId))
          .where(and(eq(positions.tenantId, ctx.tenantId), gte(positions.startsAt, range.from), lte(positions.startsAt, range.to), activeEvent))
          .groupBy(sql`date_trunc('week', ${positions.startsAt} at time zone 'Europe/Berlin')`)
          .orderBy(sql`date_trunc('week', ${positions.startsAt} at time zone 'Europe/Berlin')`);
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "week", label: "Kalenderwoche" }, { key: "positionsCount", label: "Positionen", numeric: true }, { key: "required", label: "Bedarf (Personen)", numeric: true }, { key: "filled", label: "Besetzt", numeric: true }],
          rows,
          summary: { Wochen: rows.length, "Bedarf gesamt": rows.reduce((a, r) => a + r.required, 0) },
          preliminary: range.to > new Date(),
          notes: range.to > new Date() ? ["Zukünftige Wochen zeigen den aktuellen Planungsstand."] : [],
        };
      }
      case "orders": {
        const rows = await tx
          .select({ orderNumber: orders.orderNumber, customer: customers.name, event: events.name, eventStartsAt: events.startsAt, status: orders.status, confirmedAt: orders.confirmedAt, released: orders.releasedToCustomerAt })
          .from(orders)
          .innerJoin(customers, eq(customers.id, orders.customerId))
          .leftJoin(events, eq(events.id, orders.eventId))
          .where(and(eq(orders.tenantId, ctx.tenantId), gte(orders.createdAt, range.from), lte(orders.createdAt, range.to)))
          .orderBy(desc(orders.createdAt));
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        return {
          key,
          title: REPORT_LABELS[key],
          range,
          columns: [{ key: "orderNumber", label: "Auftrag" }, { key: "customer", label: "Kunde" }, { key: "event", label: "Veranstaltung" }, { key: "eventStartsAt", label: "Termin" }, { key: "status", label: "Status" }, { key: "confirmedAt", label: "Bestätigt am" }],
          rows: rows.map((r) => ({ orderNumber: r.orderNumber, customer: r.customer, event: r.event, eventStartsAt: r.eventStartsAt?.toISOString() ?? null, status: r.status, confirmedAt: r.confirmedAt?.toISOString() ?? null })),
          summary: { Aufträge: rows.length, ...byStatus },
          preliminary: (byStatus.draft ?? 0) + (byStatus.offered ?? 0) > 0,
          notes: ["Zeitraum bezieht sich auf das Anlagedatum des Auftrags."],
        };
      }
    }
  });
}

export async function exportReportCsv(ctx: AuthContext, key: ReportKey, range: Range): Promise<string> {
  requirePermission(ctx, "reports:export");
  const r = await runReport(ctx, key, range);
  const csv = stringifyCsv(r.rows, { header: true, columns: r.columns.map((c) => ({ key: c.key, header: c.label })), delimiter: ";" });
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, { action: "report.exported", entityType: "report", after: { key, range, rows: r.rows.length } }));
  return (r.preliminary ? `# Vorläufig – enthält offene oder noch nicht abgeschlossene Daten\n` : "") + csv;
}
