import { and, eq, sql, asc, desc, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "../../db/client";
import { customers, customerContacts, locations, events, orders, customerRequests, documents } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError } from "../../core/errors";
import { audit } from "../../core/audit";
import { nextNumber } from "../../core/numbering";
import { toPage, offsetOf } from "../../core/pagination";
import { customerInput, contactInput, locationInput, customerListQuery, type CustomerInput } from "./schema";

export async function listCustomers(ctx: AuthContext, query: Partial<z.infer<typeof customerListQuery>> = {}) {
  requirePermission(ctx, "customers:read");
  const q = customerListQuery.parse(query);
  const conds = [eq(customers.tenantId, ctx.tenantId)];
  if (q.status !== "all") conds.push(eq(customers.status, q.status));
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(or(ilike(customers.name, like), ilike(customers.customerNumber, like), ilike(customers.legalName, like), ilike(customers.email, like))!);
  }
  const where = and(...conds);
  const col = { name: customers.name, customerNumber: customers.customerNumber, createdAt: customers.createdAt }[q.sort];
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({
        c: customers,
        eventCount: sql<number>`(select count(*)::int from events e where e.customer_id = ${customers.id})`,
        openRequests: sql<number>`(select count(*)::int from customer_requests r where r.customer_id = ${customers.id} and r.status in ('new','in_review','needs_info'))`,
      })
      .from(customers)
      .where(where)
      .orderBy(q.dir === "asc" ? asc(col) : desc(col))
      .limit(q.pageSize)
      .offset(offsetOf(q));
    const total = (await tx.select({ c: sql<number>`count(*)::int` }).from(customers).where(where))[0]?.c ?? 0;
    return toPage(
      rows.map((r) => ({ ...r.c, eventCount: r.eventCount, openRequests: r.openRequests })),
      total,
      q,
    );
  });
}

export async function getCustomer(ctx: AuthContext, id: string) {
  requirePermission(ctx, "customers:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const c = (await tx.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId))).limit(1))[0];
    if (!c) throw new NotFoundError("Kunde nicht gefunden");
    const contacts = await tx.select().from(customerContacts).where(eq(customerContacts.customerId, id)).orderBy(desc(customerContacts.isPrimary), asc(customerContacts.name));
    const locs = await tx.select().from(locations).where(eq(locations.customerId, id)).orderBy(asc(locations.name));
    const evs = await tx.select({ id: events.id, name: events.name, status: events.status, startsAt: events.startsAt, endsAt: events.endsAt }).from(events).where(eq(events.customerId, id)).orderBy(desc(events.startsAt)).limit(50);
    const ords = await tx.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt)).limit(50);
    const reqs = await tx.select({ id: customerRequests.id, title: customerRequests.title, status: customerRequests.status, createdAt: customerRequests.createdAt, startsAt: customerRequests.startsAt }).from(customerRequests).where(eq(customerRequests.customerId, id)).orderBy(desc(customerRequests.createdAt)).limit(50);
    const docs = await tx.select().from(documents).where(and(eq(documents.entityType, "customer"), eq(documents.entityId, id), sql`${documents.deletedAt} is null`)).orderBy(desc(documents.createdAt));
    return { customer: c, contacts, locations: locs, events: evs, orders: ords, requests: reqs, documents: docs };
  });
}

/** Ähnliche Kunden (zur Vermeidung von Duplikaten) – einfache Namensähnlichkeit. */
export async function findSimilarCustomers(ctx: AuthContext, name: string, exceptId?: string) {
  requirePermission(ctx, "customers:read");
  const norm = name.trim().toLowerCase().replace(/\b(gmbh|ag|kg|ohg|ug|e\.?k\.?|co\.?|&)\b/g, "").replace(/[^a-z0-9äöüß ]/g, "").trim();
  if (norm.length < 3) return [];
  const first = norm.split(" ")[0]!;
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: customers.id, name: customers.name, customerNumber: customers.customerNumber, city: sql<string | null>`${customers.billingAddress}->>'city'` })
      .from(customers)
      .where(and(eq(customers.tenantId, ctx.tenantId), ilike(customers.name, `%${first}%`), exceptId ? sql`${customers.id} <> ${exceptId}` : sql`true`))
      .limit(5),
  );
}

export async function createCustomer(ctx: AuthContext, input: CustomerInput) {
  requirePermission(ctx, "customers:write");
  const data = customerInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const customerNumber = data.customerNumber?.trim() || (await nextNumber(tx, "customers", "customer_number", ctx.tenantId, "KD"));
    const dup = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.customerNumber, customerNumber))).limit(1);
    if (dup[0]) throw new ConflictError(`Kundennummer „${customerNumber}“ ist bereits vergeben.`);
    const [row] = await tx.insert(customers).values({ tenantId: ctx.tenantId, ...data, customerNumber, email: data.email ?? null, billingEmail: data.billingEmail ?? null, billingAddress: data.billingAddress ?? null }).returning();
    await audit(tx, ctx, { action: "customer.created", entityType: "customer", entityId: row!.id, after: row });
    return row!;
  });
}

export async function updateCustomer(ctx: AuthContext, id: string, input: Partial<CustomerInput>) {
  requirePermission(ctx, "customers:write");
  const data = customerInput.partial().parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Kunde nicht gefunden");
    const { customerNumber, ...rest } = data;
    if (customerNumber && customerNumber !== before.customerNumber) {
      const dup = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.customerNumber, customerNumber))).limit(1);
      if (dup[0]) throw new ConflictError(`Kundennummer „${customerNumber}“ ist bereits vergeben.`);
    }
    const [row] = await tx
      .update(customers)
      .set({ ...rest, ...(customerNumber ? { customerNumber } : {}), billingAddress: rest.billingAddress === undefined ? before.billingAddress : rest.billingAddress })
      .where(eq(customers.id, id))
      .returning();
    await audit(tx, ctx, { action: "customer.updated", entityType: "customer", entityId: id, before, after: row });
    return row!;
  });
}

export async function upsertContact(ctx: AuthContext, customerId: string, input: z.infer<typeof contactInput>, contactId?: string) {
  requirePermission(ctx, "customers:write");
  const data = contactInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const c = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), eq(customers.tenantId, ctx.tenantId))).limit(1);
    if (!c[0]) throw new NotFoundError("Kunde nicht gefunden");
    if (data.isPrimary) await tx.update(customerContacts).set({ isPrimary: false }).where(eq(customerContacts.customerId, customerId));
    const values = { ...data, email: data.email ?? null };
    const [row] = contactId
      ? await tx.update(customerContacts).set(values).where(and(eq(customerContacts.id, contactId), eq(customerContacts.customerId, customerId))).returning()
      : await tx.insert(customerContacts).values({ tenantId: ctx.tenantId, customerId, ...values }).returning();
    if (!row) throw new NotFoundError("Ansprechpartner nicht gefunden");
    await audit(tx, ctx, { action: contactId ? "customer.contact_updated" : "customer.contact_created", entityType: "customer", entityId: customerId, after: row });
    return row;
  });
}

export async function deleteContact(ctx: AuthContext, customerId: string, contactId: string) {
  requirePermission(ctx, "customers:write");
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.delete(customerContacts).where(and(eq(customerContacts.id, contactId), eq(customerContacts.customerId, customerId), eq(customerContacts.tenantId, ctx.tenantId)));
    await audit(tx, ctx, { action: "customer.contact_deleted", entityType: "customer", entityId: customerId, after: { contactId } });
  });
}

export async function upsertLocation(ctx: AuthContext, input: z.infer<typeof locationInput>, locationId?: string) {
  requirePermission(ctx, "customers:write");
  const data = locationInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = locationId
      ? await tx.update(locations).set(data).where(and(eq(locations.id, locationId), eq(locations.tenantId, ctx.tenantId))).returning()
      : await tx.insert(locations).values({ tenantId: ctx.tenantId, ...data }).returning();
    if (!row) throw new NotFoundError("Standort nicht gefunden");
    await audit(tx, ctx, { action: locationId ? "location.updated" : "location.created", entityType: "location", entityId: row.id, after: row });
    return row;
  });
}

export async function listLocations(ctx: AuthContext, customerId?: string) {
  requirePermission(ctx, "customers:read");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select()
      .from(locations)
      .where(and(eq(locations.tenantId, ctx.tenantId), customerId ? or(eq(locations.customerId, customerId), sql`${locations.customerId} is null`)! : sql`true`))
      .orderBy(asc(locations.name)),
  );
}
