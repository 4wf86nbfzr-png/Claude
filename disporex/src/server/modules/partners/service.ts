import { and, eq, sql, asc, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "../../db/client";
import { partners, partnerContacts, partnerOffers, positions, events, shifts, customers, locations, documents, memberships, qualifications } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requireAny, requirePermission } from "../../auth/context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { emitEvent } from "../../core/events";
import { notifyRoles, notifyUser } from "../notifications/service";
import { partnerInput, partnerContactInput, offerInput, offerResponseInput, type PartnerInput } from "./schema";
import { fmtRange } from "@/lib/format";

export async function listPartners(ctx: AuthContext, filter: { q?: string; status?: string } = {}) {
  requirePermission(ctx, "partners:read");
  const conds = [eq(partners.tenantId, ctx.tenantId)];
  if (filter.status && filter.status !== "all") conds.push(eq(partners.status, filter.status as "active"));
  if (filter.q) conds.push(sql`${partners.name} ilike ${"%" + filter.q + "%"}`);
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({
        p: partners,
        openOffers: sql<number>`(select count(*)::int from partner_offers o where o.partner_id = ${partners.id} and o.status = 'offered')`,
        committed: sql<number>`(select coalesce(sum(o.headcount_committed),0)::int from partner_offers o where o.partner_id = ${partners.id} and o.status in ('accepted','partially_accepted','fulfilled'))`,
      })
      .from(partners)
      .where(and(...conds))
      .orderBy(asc(partners.name))
      .limit(500),
  );
}

export async function getPartner(ctx: AuthContext, id: string) {
  requireAny(ctx, "partners:read", "portal:partner");
  if (ctx.role === "partner" && ctx.partnerId !== id) throw new NotFoundError("Partner nicht gefunden");
  return withTenant(ctx.tenantId, async (tx) => {
    const p = (await tx.select().from(partners).where(and(eq(partners.id, id), eq(partners.tenantId, ctx.tenantId))).limit(1))[0];
    if (!p) throw new NotFoundError("Partner nicht gefunden");
    const contacts = await tx.select().from(partnerContacts).where(eq(partnerContacts.partnerId, id)).orderBy(desc(partnerContacts.isPrimary), asc(partnerContacts.name));
    const offers = await listOffersFor(ctx, { partnerId: id });
    const docs = ctx.role === "partner" ? [] : await tx.select().from(documents).where(and(eq(documents.entityType, "partner"), eq(documents.entityId, id), sql`${documents.deletedAt} is null`)).orderBy(desc(documents.createdAt));
    const quals = await tx.select({ id: qualifications.id, name: qualifications.name }).from(qualifications).where(eq(qualifications.tenantId, ctx.tenantId));
    return { partner: p, contacts, offers, documents: docs, qualificationNames: p.qualificationIds.map((q) => quals.find((x) => x.id === q)?.name ?? "?") };
  });
}

export async function createPartner(ctx: AuthContext, input: PartnerInput) {
  requirePermission(ctx, "partners:write");
  const data = partnerInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.insert(partners).values({ tenantId: ctx.tenantId, ...data, email: data.email ?? null }).returning();
    await audit(tx, ctx, { action: "partner.created", entityType: "partner", entityId: row!.id, after: row });
    return row!;
  });
}

export async function updatePartner(ctx: AuthContext, id: string, input: Partial<PartnerInput>) {
  requirePermission(ctx, "partners:write");
  const data = partnerInput.partial().parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(partners).where(and(eq(partners.id, id), eq(partners.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError();
    const [row] = await tx.update(partners).set(data).where(eq(partners.id, id)).returning();
    await audit(tx, ctx, { action: "partner.updated", entityType: "partner", entityId: id, before, after: row });
    return row!;
  });
}

export async function upsertPartnerContact(ctx: AuthContext, partnerId: string, input: z.infer<typeof partnerContactInput>) {
  requirePermission(ctx, "partners:write");
  const data = partnerContactInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    if (data.isPrimary) await tx.update(partnerContacts).set({ isPrimary: false }).where(eq(partnerContacts.partnerId, partnerId));
    const [row] = await tx.insert(partnerContacts).values({ tenantId: ctx.tenantId, partnerId, ...data, email: data.email ?? null }).returning();
    await audit(tx, ctx, { action: "partner.contact_created", entityType: "partner", entityId: partnerId, after: row });
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Angebote an Partner
// ---------------------------------------------------------------------------
export async function listOffersFor(ctx: AuthContext, filter: { partnerId?: string; positionId?: string; status?: string } = {}) {
  requireAny(ctx, "partners:read", "portal:partner");
  const conds = [eq(partnerOffers.tenantId, ctx.tenantId)];
  if (ctx.role === "partner") conds.push(eq(partnerOffers.partnerId, ctx.partnerId ?? "00000000-0000-0000-0000-000000000000"));
  else if (filter.partnerId) conds.push(eq(partnerOffers.partnerId, filter.partnerId));
  if (filter.positionId) conds.push(eq(partnerOffers.positionId, filter.positionId));
  if (filter.status && filter.status !== "all") conds.push(eq(partnerOffers.status, filter.status as "offered"));
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({
        o: partnerOffers,
        partnerName: partners.name,
        positionName: positions.name,
        positionStartsAt: positions.startsAt,
        positionEndsAt: positions.endsAt,
        requiredQualificationIds: positions.requiredQualificationIds,
        eventId: events.id,
        eventName: events.name,
        eventStatus: events.status,
        customerName: customers.name,
        locationName: locations.name,
        locationCity: locations.city,
        meetingPoint: events.meetingPoint,
        dresscode: events.dresscode,
        briefing: events.briefing,
      })
      .from(partnerOffers)
      .innerJoin(partners, eq(partners.id, partnerOffers.partnerId))
      .innerJoin(positions, eq(positions.id, partnerOffers.positionId))
      .innerJoin(events, eq(events.id, positions.eventId))
      .innerJoin(customers, eq(customers.id, events.customerId))
      .leftJoin(locations, eq(locations.id, events.locationId))
      .where(and(...conds))
      .orderBy(desc(partnerOffers.createdAt))
      .limit(300),
  ).then((rows) =>
    rows.map((r) => ({
      ...r,
      // Partner sehen nur freigegebene Informationen: kein Kundenname bei nicht geteiltem Briefing, nie interne Notizen.
      briefing: r.o.shareBriefing ? r.briefing : null,
      customerName: ctx.role === "partner" && !r.o.shareBriefing ? null : r.customerName,
    })),
  );
}

/** Bietet einem Partner (Teil-)Besetzung einer Position an. */
export async function createOffer(ctx: AuthContext, input: z.infer<typeof offerInput>) {
  requirePermission(ctx, "partners:write");
  const data = offerInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const p = (await tx.select().from(partners).where(and(eq(partners.id, data.partnerId), eq(partners.tenantId, ctx.tenantId))).limit(1))[0];
    if (!p) throw new NotFoundError("Partner nicht gefunden");
    if (p.status !== "active") throw new ConflictError("Partner ist nicht aktiv.");
    const pos = (await tx.select().from(positions).where(and(eq(positions.id, data.positionId), eq(positions.tenantId, ctx.tenantId))).limit(1))[0];
    if (!pos) throw new NotFoundError("Position nicht gefunden");
    const openSlots = (await tx.select({ c: sql<number>`count(*)::int` }).from(shifts).where(and(eq(shifts.positionId, pos.id), eq(shifts.status, "open"))))[0]?.c ?? 0;
    if (data.headcountRequested > openSlots) throw new ValidationError(`Nur ${openSlots} offene Slots in dieser Position.`);
    const missingQ = pos.requiredQualificationIds.filter((q) => !p.qualificationIds.includes(q));
    const [row] = await tx
      .insert(partnerOffers)
      .values({ tenantId: ctx.tenantId, partnerId: p.id, positionId: pos.id, headcountRequested: data.headcountRequested, message: data.message ?? null, shareBriefing: data.shareBriefing, deadlineAt: data.deadlineAt ?? null, offeredBy: ctx.userId })
      .returning();
    await audit(tx, ctx, { action: "partner_offer.created", entityType: "partner_offer", entityId: row!.id, after: { ...row, missingQualifications: missingQ } });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "partner_offer.created", entityType: "partner_offer", entityId: row!.id, payload: { id: row!.id, partnerId: p.id, positionId: pos.id, headcountRequested: data.headcountRequested }, actorUserId: ctx.userId });
    const ev = (await tx.select({ name: events.name }).from(events).where(eq(events.id, pos.eventId)).limit(1))[0];
    const users = await tx.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.partnerId, p.id), eq(memberships.status, "active")));
    for (const u of users) {
      await notifyUser(tx, ctx.tenantId, { userId: u.userId, kind: "partner.offer", title: `Neue Personalanfrage: ${pos.name}`, body: `${data.headcountRequested} Personen · ${fmtRange(pos.startsAt, pos.endsAt)}${ev ? ` · ${ev.name}` : ""}${data.deadlineAt ? ` · Rückmeldung bis ${data.deadlineAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}`, link: `/portal/partner`, priority: "high", dedupeKey: `offer:${row!.id}:${u.userId}` });
    }
    return { offer: row!, missingQualifications: missingQ };
  });
}

/** Rückmeldung des Partners (Portal oder stellvertretend). Zugesagte Kapazität belegt offene Slots als Fremdpersonal. */
export async function respondToOffer(ctx: AuthContext, offerId: string, input: z.infer<typeof offerResponseInput>) {
  const data = offerResponseInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const o = (await tx.select().from(partnerOffers).where(and(eq(partnerOffers.id, offerId), eq(partnerOffers.tenantId, ctx.tenantId))).limit(1))[0];
    if (!o) throw new NotFoundError("Angebot nicht gefunden");
    if (ctx.role === "partner") {
      if (o.partnerId !== ctx.partnerId || !ctx.permissions.has("partners:respond_own")) throw new ForbiddenError();
    } else requirePermission(ctx, "partners:write");
    if (o.status !== "offered") throw new ConflictError("Angebot ist nicht mehr offen.");
    if (o.deadlineAt && o.deadlineAt < new Date() && ctx.role === "partner") throw new ConflictError("Die Rückmeldefrist ist abgelaufen.");
    const committed = data.response === "declined" ? 0 : Math.min(data.headcountCommitted || o.headcountRequested, o.headcountRequested);
    const status = data.response === "declined" ? "declined" : committed >= o.headcountRequested ? "accepted" : "partially_accepted";
    if (status !== "declined" && committed === 0) throw new ValidationError("Bitte Anzahl der zugesagten Personen angeben.");
    const [row] = await tx.update(partnerOffers).set({ status, headcountCommitted: committed, responseNote: data.responseNote ?? null, respondedAt: new Date(), respondedBy: ctx.userId }).where(eq(partnerOffers.id, o.id)).returning();
    // Offene Slots als Partnerpersonal belegen
    let filled = 0;
    if (committed > 0) {
      const open = await tx.select().from(shifts).where(and(eq(shifts.positionId, o.positionId), eq(shifts.status, "open"))).orderBy(asc(shifts.createdAt)).limit(committed);
      for (let i = 0; i < open.length; i++) {
        await tx.update(shifts).set({ status: "confirmed", partnerId: o.partnerId, partnerStaffName: data.staffNames[i] ?? null, confirmedAt: new Date(), confirmedBy: ctx.userId, respondedAt: new Date() }).where(eq(shifts.id, open[i]!.id));
        filled++;
      }
    }
    await audit(tx, ctx, { action: "partner_offer.responded", entityType: "partner_offer", entityId: o.id, after: { status, committed, filled }, reason: data.responseNote });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "partner_offer.responded", entityType: "partner_offer", entityId: o.id, payload: { id: o.id, status, committed, filled, partnerId: o.partnerId, positionId: o.positionId }, actorUserId: ctx.userId });
    const pos = (await tx.select({ name: positions.name, eventId: positions.eventId }).from(positions).where(eq(positions.id, o.positionId)).limit(1))[0];
    const pn = (await tx.select({ name: partners.name }).from(partners).where(eq(partners.id, o.partnerId)).limit(1))[0];
    await notifyRoles(tx, ctx.tenantId, ["dispatcher", "tenant_admin"], {
      kind: "partner.response",
      title: `Partner ${pn?.name ?? ""}: ${status === "declined" ? "Absage" : `${committed} Personen zugesagt`}`,
      body: `${pos?.name ?? "Position"} – ${filled} Slots als Fremdpersonal belegt.${data.responseNote ? ` Hinweis: ${data.responseNote}` : ""}`,
      link: pos ? `/veranstaltungen/${pos.eventId}` : "/partner",
      priority: status === "declined" ? "high" : "normal",
      dedupeKey: `offer.resp:${o.id}`,
    });
    return { offer: row!, filled };
  });
}

export async function withdrawOffer(ctx: AuthContext, offerId: string) {
  requirePermission(ctx, "partners:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.update(partnerOffers).set({ status: "withdrawn" }).where(and(eq(partnerOffers.id, offerId), eq(partnerOffers.tenantId, ctx.tenantId), inArray(partnerOffers.status, ["offered"]))).returning({ id: partnerOffers.id });
    if (!res[0]) throw new ConflictError("Nur offene Angebote können zurückgezogen werden.");
    await audit(tx, ctx, { action: "partner_offer.withdrawn", entityType: "partner_offer", entityId: offerId });
  });
}
