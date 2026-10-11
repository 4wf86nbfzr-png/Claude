import { and, eq, sql, or, ilike, desc } from "drizzle-orm";
import { withTenant } from "../../db/client";
import { employees, customers, events, orders, shifts, partners, documents, customerRequests } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";

export type SearchHit = { type: string; id: string; title: string; subtitle?: string; href: string };

/** Zentrale Suche – ausschließlich im Mandanten und nur in Bereichen mit Leserecht. */
export async function globalSearch(ctx: AuthContext, q: string, limitPerType = 8): Promise<{ hits: SearchHit[]; groups: Record<string, SearchHit[]> }> {
  requirePermission(ctx, "search:use");
  const term = q.trim().slice(0, 100);
  const groups: Record<string, SearchHit[]> = {};
  if (term.length < 2) return { hits: [], groups };
  const like = `%${term}%`;
  await withTenant(ctx.tenantId, async (tx) => {
    if (ctx.permissions.has("employees:read")) {
      const rows = await tx.select().from(employees).where(and(eq(employees.tenantId, ctx.tenantId), or(ilike(employees.firstName, like), ilike(employees.lastName, like), ilike(employees.employeeNumber, like), ilike(employees.email, like), ilike(employees.phone, like)))).limit(limitPerType);
      groups.Mitarbeiter = rows.map((e) => ({ type: "employee", id: e.id, title: `${e.lastName}, ${e.firstName}`, subtitle: `${e.employeeNumber} · ${e.status}`, href: `/mitarbeiter/${e.id}` }));
    }
    if (ctx.permissions.has("customers:read")) {
      const rows = await tx.select().from(customers).where(and(eq(customers.tenantId, ctx.tenantId), or(ilike(customers.name, like), ilike(customers.customerNumber, like), ilike(customers.email, like), ilike(customers.legalName, like)))).limit(limitPerType);
      groups.Kunden = rows.map((c) => ({ type: "customer", id: c.id, title: c.name, subtitle: c.customerNumber, href: `/kunden/${c.id}` }));
    }
    if (ctx.permissions.has("events:read")) {
      const rows = await tx.select({ e: events, customer: customers.name }).from(events).innerJoin(customers, eq(customers.id, events.customerId)).where(and(eq(events.tenantId, ctx.tenantId), or(ilike(events.name, like), ilike(events.meetingPoint, like), ilike(customers.name, like)))).orderBy(desc(events.startsAt)).limit(limitPerType);
      groups.Veranstaltungen = rows.map(({ e, customer }) => ({ type: "event", id: e.id, title: e.name, subtitle: `${customer} · ${e.startsAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} · ${e.status}`, href: `/veranstaltungen/${e.id}` }));
    }
    if (ctx.permissions.has("orders:read")) {
      const rows = await tx.select({ o: orders, customer: customers.name }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(and(eq(orders.tenantId, ctx.tenantId), or(ilike(orders.orderNumber, like), ilike(customers.name, like)))).limit(limitPerType);
      groups.Aufträge = rows.map(({ o, customer }) => ({ type: "order", id: o.id, title: o.orderNumber, subtitle: `${customer} · ${o.status}`, href: o.eventId ? `/veranstaltungen/${o.eventId}` : "/auftraege" }));
    }
    if (ctx.permissions.has("requests:read")) {
      const rows = await tx.select().from(customerRequests).where(and(eq(customerRequests.tenantId, ctx.tenantId), or(ilike(customerRequests.title, like), ilike(customerRequests.contactName, like), ilike(customerRequests.contactEmail, like), ilike(customerRequests.locationText, like)))).orderBy(desc(customerRequests.createdAt)).limit(limitPerType);
      groups.Anfragen = rows.map((r) => ({ type: "request", id: r.id, title: r.title, subtitle: r.status, href: `/anfragen/${r.id}` }));
    }
    if (ctx.permissions.has("shifts:read")) {
      const rows = await tx
        .select({ s: shifts, event: events.name, emp: sql<string | null>`case when ${employees.id} is null then null else ${employees.lastName} || ', ' || ${employees.firstName} end` })
        .from(shifts)
        .innerJoin(events, eq(events.id, shifts.eventId))
        .leftJoin(employees, eq(employees.id, shifts.employeeId))
        .where(and(eq(shifts.tenantId, ctx.tenantId), or(ilike(events.name, like), ilike(employees.lastName, like))))
        .orderBy(desc(shifts.startsAt))
        .limit(limitPerType);
      groups.Schichten = rows.map(({ s, event, emp }) => ({ type: "shift", id: s.id, title: `${event} · ${s.startsAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`, subtitle: `${emp ?? "unbesetzt"} · ${s.status}`, href: `/schichten/${s.id}` }));
    }
    if (ctx.permissions.has("partners:read")) {
      const rows = await tx.select().from(partners).where(and(eq(partners.tenantId, ctx.tenantId), or(ilike(partners.name, like), ilike(partners.email, like)))).limit(limitPerType);
      groups.Partner = rows.map((p) => ({ type: "partner", id: p.id, title: p.name, subtitle: p.status, href: `/partner/${p.id}` }));
    }
    if (ctx.permissions.has("documents:read")) {
      const conds = [eq(documents.tenantId, ctx.tenantId), sql`${documents.deletedAt} is null`, or(ilike(documents.title, like), ilike(documents.filename, like))!];
      if (!ctx.permissions.has("employees:documents")) conds.push(sql`${documents.entityType} <> 'employee'`);
      if (!ctx.permissions.has("documents:confidential")) conds.push(sql`${documents.confidentiality} <> 'confidential'`);
      const rows = await tx.select().from(documents).where(and(...conds)).limit(limitPerType);
      groups.Dokumente = rows.map((d) => ({ type: "document", id: d.id, title: d.title, subtitle: `${d.entityType} · ${d.category}`, href: `/dokumente/${d.id}` }));
    }
  });
  for (const k of Object.keys(groups)) if (groups[k]!.length === 0) delete groups[k];
  return { hits: Object.values(groups).flat(), groups };
}
