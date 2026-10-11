import { and, eq, sql, desc, asc, gte, lte, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "../../db/client";
import { rateCards, surchargeRules, billingItems, shifts, events, positions, customers, reconciliationItems } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { minutesBetween } from "../../core/time";
import { tzOffsetMinutes } from "@/lib/tz";
import { stringify as stringifyCsv } from "csv-stringify/sync";

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal("").transform(() => null));

export const rateCardInput = z.object({
  customerId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  billingCategory: optStr(60),
  label: z.string().trim().min(2).max(120),
  hourlyRateCents: z.coerce.number().int().min(0).max(100_000_00),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("").transform(() => null)),
});

export const surchargeInput = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["night", "sunday", "holiday", "saturday"]),
  percent: z.coerce.number().int().min(0).max(300),
  fromTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal("").transform(() => null)),
  toTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal("").transform(() => null)),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("").transform(() => null)),
});

export async function listRateCards(ctx: AuthContext) {
  requirePermission(ctx, "billing:read");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ r: rateCards, customerName: customers.name, used: sql<number>`(select count(*)::int from billing_items b where b.rate_card_id = ${rateCards.id})` })
      .from(rateCards)
      .leftJoin(customers, eq(customers.id, rateCards.customerId))
      .where(eq(rateCards.tenantId, ctx.tenantId))
      .orderBy(asc(customers.name), asc(rateCards.billingCategory), desc(rateCards.validFrom)),
  );
}

export async function createRateCard(ctx: AuthContext, input: z.infer<typeof rateCardInput>) {
  requirePermission(ctx, "billing:write");
  const data = rateCardInput.parse(input);
  if (data.validTo && data.validTo < data.validFrom) throw new ValidationError("„Gültig bis“ liegt vor „gültig ab“.");
  return withTenant(ctx.tenantId, async (tx) => {
    // Überlappende Sätze gleicher Zuordnung beenden (nie überschreiben): Vorgänger endet am Vortag.
    const overlapping = await tx
      .select()
      .from(rateCards)
      .where(and(eq(rateCards.tenantId, ctx.tenantId), data.customerId ? eq(rateCards.customerId, data.customerId) : isNull(rateCards.customerId), data.billingCategory ? eq(rateCards.billingCategory, data.billingCategory) : isNull(rateCards.billingCategory), or(isNull(rateCards.validTo), gte(rateCards.validTo, data.validFrom))!, lte(rateCards.validFrom, data.validFrom)));
    const dayBefore = new Date(new Date(data.validFrom).getTime() - 86_400_000).toISOString().slice(0, 10);
    for (const o of overlapping) {
      if (o.validFrom === data.validFrom) throw new ConflictError("Für dieses Datum existiert bereits ein Satz. Bitte ein neues Gültig-ab-Datum wählen.");
      await tx.update(rateCards).set({ validTo: dayBefore }).where(eq(rateCards.id, o.id));
    }
    const [row] = await tx.insert(rateCards).values({ tenantId: ctx.tenantId, ...data, createdBy: ctx.userId }).returning();
    await audit(tx, ctx, { action: "rate_card.created", entityType: "rate_card", entityId: row!.id, after: { ...data, closedPredecessors: overlapping.map((o) => o.id) } });
    return row!;
  });
}

/** Ein Satz, der bereits in Abrechnungsgrundlagen steckt, kann nur beendet, nicht geändert werden. */
export async function endRateCard(ctx: AuthContext, id: string, validTo: string) {
  requirePermission(ctx, "billing:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const r = (await tx.select().from(rateCards).where(and(eq(rateCards.id, id), eq(rateCards.tenantId, ctx.tenantId))).limit(1))[0];
    if (!r) throw new NotFoundError();
    if (validTo < r.validFrom) throw new ValidationError("Ende liegt vor Beginn.");
    await tx.update(rateCards).set({ validTo }).where(eq(rateCards.id, id));
    await audit(tx, ctx, { action: "rate_card.ended", entityType: "rate_card", entityId: id, before: { validTo: r.validTo }, after: { validTo } });
  });
}

export async function deleteRateCard(ctx: AuthContext, id: string) {
  requirePermission(ctx, "billing:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const used = (await tx.select({ c: sql<number>`count(*)::int` }).from(billingItems).where(eq(billingItems.rateCardId, id)))[0]?.c ?? 0;
    if (used > 0) throw new ConflictError("Satz wird in Abrechnungsgrundlagen verwendet und kann nur beendet werden.");
    const res = await tx.delete(rateCards).where(and(eq(rateCards.id, id), eq(rateCards.tenantId, ctx.tenantId))).returning({ id: rateCards.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "rate_card.deleted", entityType: "rate_card", entityId: id });
  });
}

export async function listSurchargeRules(ctx: AuthContext) {
  requirePermission(ctx, "billing:read");
  return withTenant(ctx.tenantId, (tx) => tx.select().from(surchargeRules).where(eq(surchargeRules.tenantId, ctx.tenantId)).orderBy(asc(surchargeRules.kind), desc(surchargeRules.validFrom)));
}

export async function createSurchargeRule(ctx: AuthContext, input: z.infer<typeof surchargeInput>) {
  requirePermission(ctx, "billing:write");
  const data = surchargeInput.parse(input);
  if (data.kind === "night" && (!data.fromTime || !data.toTime)) throw new ValidationError("Nachtzuschlag braucht ein Zeitfenster (von/bis).");
  if (data.kind === "holiday" && data.holidays.length === 0) throw new ValidationError("Feiertagszuschlag braucht eine Liste von Feiertagen.");
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx.insert(surchargeRules).values({ tenantId: ctx.tenantId, ...data }).returning();
    await audit(tx, ctx, { action: "surcharge_rule.created", entityType: "surcharge_rule", entityId: row!.id, after: data });
    return row!;
  });
}

export async function deleteSurchargeRule(ctx: AuthContext, id: string) {
  requirePermission(ctx, "billing:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.delete(surchargeRules).where(and(eq(surchargeRules.id, id), eq(surchargeRules.tenantId, ctx.tenantId))).returning({ id: surchargeRules.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "surcharge_rule.deleted", entityType: "surcharge_rule", entityId: id });
  });
}

// ---------------------------------------------------------------------------
// Berechnung
// ---------------------------------------------------------------------------
type Rule = typeof surchargeRules.$inferSelect;

function localParts(d: Date, tz: string) {
  const local = new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60_000);
  return { date: local.toISOString().slice(0, 10), minuteOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(), weekday: local.getUTCDay() };
}

/** Minuten eines Intervalls, auf die eine Zuschlagsregel zutrifft (minutengenau, Zeitzone des Mandanten). */
export function surchargeMinutes(start: Date, end: Date, rule: Rule, tz = "Europe/Berlin"): number {
  let n = 0;
  const total = minutesBetween(start, end);
  for (let i = 0; i < total; i++) {
    const t = new Date(start.getTime() + i * 60_000);
    const p = localParts(t, tz);
    if (rule.validFrom > p.date || (rule.validTo && rule.validTo < p.date)) continue;
    let hit = false;
    if (rule.kind === "sunday") hit = p.weekday === 0;
    else if (rule.kind === "saturday") hit = p.weekday === 6;
    else if (rule.kind === "holiday") hit = rule.holidays.includes(p.date);
    else if (rule.kind === "night" && rule.fromTime && rule.toTime) {
      const [fh, fm] = rule.fromTime.split(":").map(Number) as [number, number];
      const [th, tm] = rule.toTime.split(":").map(Number) as [number, number];
      const from = fh * 60 + fm;
      const to = th * 60 + tm;
      hit = from <= to ? p.minuteOfDay >= from && p.minuteOfDay < to : p.minuteOfDay >= from || p.minuteOfDay < to;
    }
    if (hit) n++;
  }
  return n;
}

async function findRate(tx: Tx, tenantId: string, customerId: string, billingCategory: string | null, day: string) {
  const cands = await tx
    .select()
    .from(rateCards)
    .where(and(eq(rateCards.tenantId, tenantId), or(eq(rateCards.customerId, customerId), isNull(rateCards.customerId))!, lte(rateCards.validFrom, day), or(isNull(rateCards.validTo), gte(rateCards.validTo, day))!));
  // Priorität: Kunde+Kategorie > Kunde > Kategorie > Standard
  const score = (r: typeof rateCards.$inferSelect) => (r.customerId === customerId ? 2 : 0) + (billingCategory && r.billingCategory === billingCategory ? 1 : 0) - (r.billingCategory && r.billingCategory !== billingCategory ? 10 : 0);
  const best = cands.filter((r) => !r.billingCategory || r.billingCategory === billingCategory).sort((a, b) => score(b) - score(a))[0];
  return best ?? null;
}

export type GenerateResult = { generated: number; updated: number; skippedFinal: number; missingRate: number; preliminary: number };

/**
 * Erzeugt/aktualisiert vorläufige Abrechnungsgrundlagen je bestätigter Schicht eines
 * Kunden im Zeitraum. Ist-Minuten stammen aus bestätigten Abgleichseinträgen, sonst
 * gelten die geplanten Minuten (vorläufig). Finale Positionen werden nie verändert.
 */
export async function generateBillingItems(ctx: AuthContext, customerId: string, range: { from: Date; to: Date }, tz = "Europe/Berlin"): Promise<GenerateResult> {
  requirePermission(ctx, "billing:write");
  return withTenant(ctx.tenantId, async (tx) => {
    const rules = await tx.select().from(surchargeRules).where(eq(surchargeRules.tenantId, ctx.tenantId));
    const rows = await tx
      .select({ s: shifts, p: positions, e: events, rec: reconciliationItems })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .innerJoin(positions, eq(positions.id, shifts.positionId))
      .leftJoin(reconciliationItems, eq(reconciliationItems.shiftId, shifts.id))
      .where(and(eq(shifts.tenantId, ctx.tenantId), eq(events.customerId, customerId), eq(shifts.status, "confirmed"), gte(shifts.startsAt, range.from), lte(shifts.startsAt, range.to), inArray(events.status, ["confirmed", "in_progress", "completed"])));
    const result: GenerateResult = { generated: 0, updated: 0, skippedFinal: 0, missingRate: 0, preliminary: 0 };
    for (const { s, p, e, rec } of rows) {
      const existing = (await tx.select().from(billingItems).where(eq(billingItems.shiftId, s.id)).limit(1))[0];
      if (existing?.status === "final") {
        result.skippedFinal++;
        continue;
      }
      const day = localParts(s.startsAt, tz).date;
      const rate = await findRate(tx, ctx.tenantId, customerId, p.billingCategory, day);
      if (!rate) {
        result.missingRate++;
        continue;
      }
      const plannedMinutes = minutesBetween(s.startsAt, s.endsAt) - s.breakMinutes;
      const approved = rec && rec.status === "approved" && rec.approvedStart && rec.approvedEnd;
      const start = approved ? rec.approvedStart! : s.startsAt;
      const end = approved ? rec.approvedEnd! : s.endsAt;
      const breakMin = approved ? (rec.approvedBreakMinutes ?? 0) : s.breakMinutes;
      const minutes = Math.max(0, minutesBetween(start, end) - breakMin);
      const base = Math.round((minutes / 60) * rate.hourlyRateCents);
      const details: { rule: string; percent: number; minutes: number; amountCents: number }[] = [];
      let surcharge = 0;
      for (const r of rules) {
        const m = surchargeMinutes(start, end, r, tz);
        if (m > 0) {
          const amount = Math.round((m / 60) * rate.hourlyRateCents * (r.percent / 100));
          details.push({ rule: r.name, percent: r.percent, minutes: m, amountCents: amount });
          surcharge += amount;
        }
      }
      const values = { customerId, eventId: e.id, shiftId: s.id, rateCardId: rate.id, billingCategory: p.billingCategory, plannedMinutes, approvedMinutes: approved ? minutes : null, hourlyRateCents: rate.hourlyRateCents, surchargeCents: surcharge, surchargeDetails: details, totalCents: base + surcharge, status: "preliminary" as const, generatedAt: new Date() };
      if (existing) {
        await tx.update(billingItems).set(values).where(eq(billingItems.id, existing.id));
        result.updated++;
      } else {
        await tx.insert(billingItems).values({ tenantId: ctx.tenantId, ...values });
        result.generated++;
      }
      if (!approved) result.preliminary++;
    }
    await audit(tx, ctx, { action: "billing.generated", entityType: "customer", entityId: customerId, after: { range, ...result } });
    return result;
  });
}

export async function listBillingItems(ctx: AuthContext, filter: { customerId?: string; status?: "preliminary" | "final" | "all"; from?: Date; to?: Date } = {}) {
  requirePermission(ctx, "billing:read");
  const conds = [eq(billingItems.tenantId, ctx.tenantId)];
  if (filter.customerId) conds.push(eq(billingItems.customerId, filter.customerId));
  if (filter.status && filter.status !== "all") conds.push(eq(billingItems.status, filter.status));
  if (filter.from) conds.push(gte(shifts.startsAt, filter.from));
  if (filter.to) conds.push(lte(shifts.startsAt, filter.to));
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ b: billingItems, customerName: customers.name, eventName: events.name, positionName: positions.name, startsAt: shifts.startsAt, endsAt: shifts.endsAt })
      .from(billingItems)
      .innerJoin(customers, eq(customers.id, billingItems.customerId))
      .innerJoin(events, eq(events.id, billingItems.eventId))
      .innerJoin(shifts, eq(shifts.id, billingItems.shiftId))
      .innerJoin(positions, eq(positions.id, shifts.positionId))
      .where(and(...conds))
      .orderBy(asc(customers.name), asc(shifts.startsAt))
      .limit(2000),
  );
}

/** Abschließen: Snapshot wird eingefroren; nur mit bestätigten Ist-Zeiten. */
export async function finalizeBillingItems(ctx: AuthContext, ids: string[]): Promise<{ finalized: number; skipped: number }> {
  requirePermission(ctx, "billing:write");
  return withTenant(ctx.tenantId, async (tx) => {
    let finalized = 0;
    let skipped = 0;
    for (const id of ids) {
      const b = (await tx.select().from(billingItems).where(and(eq(billingItems.id, id), eq(billingItems.tenantId, ctx.tenantId))).limit(1))[0];
      if (!b || b.status === "final" || b.approvedMinutes === null) {
        skipped++;
        continue;
      }
      await tx.update(billingItems).set({ status: "final", finalizedAt: new Date(), finalizedBy: ctx.userId }).where(eq(billingItems.id, id));
      finalized++;
    }
    await audit(tx, ctx, { action: "billing.finalized", entityType: "billing_item", after: { ids, finalized, skipped } });
    return { finalized, skipped };
  });
}

export async function exportBillingCsv(ctx: AuthContext, filter: Parameters<typeof listBillingItems>[1]): Promise<string> {
  requirePermission(ctx, "billing:read");
  const rows = await listBillingItems(ctx, filter);
  const csv = stringifyCsv(
    rows.map(({ b, customerName, eventName, positionName, startsAt, endsAt }) => ({
      kunde: customerName,
      veranstaltung: eventName,
      position: positionName,
      beginn: startsAt.toISOString(),
      ende: endsAt.toISOString(),
      abrechnungsposition: b.billingCategory ?? "",
      geplant_min: b.plannedMinutes,
      ist_min: b.approvedMinutes ?? "",
      stundensatz_eur: (b.hourlyRateCents / 100).toFixed(2),
      zuschlag_eur: (b.surchargeCents / 100).toFixed(2),
      zuschlaege: (b.surchargeDetails ?? []).map((d) => `${d.rule} ${d.percent}% ${d.minutes}min`).join(" | "),
      summe_eur: (b.totalCents / 100).toFixed(2),
      status: b.status === "final" ? "final" : "vorläufig",
    })),
    { header: true, delimiter: ";" },
  );
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, { action: "billing.exported", entityType: "billing_item", after: { count: rows.length, filter } }));
  return csv;
}
