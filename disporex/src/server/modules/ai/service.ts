import { and, eq, gte, sql } from "drizzle-orm";
import { withTenant } from "../../db/client";
import { aiRequests, customerRequests, reconciliationItems, employees, shifts, events, documents } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission, systemContext } from "../../auth/context";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { env } from "../../core/env";
import { getAiProvider, type AiOutcome, type AiUsage } from "./provider";
import { requestExtractionSchema, type RequestExtraction, type DeviationExplanation, type DocumentSummary } from "./schemas";
import { computeMissingFields, dedupeHashFor } from "../requests/service";
import { effectiveSettings, getTenant } from "../tenants/service";
import { storage } from "../../storage";
import { logger } from "../../core/logger";

export type { RequestExtraction };

/** Kostenschätzung in Mikro-Euro je Token (grobe Listenpreise, konfigurierbar je Modellfamilie). */
function costMicros(usage: AiUsage): number {
  const m = usage.model;
  const [inPerM, outPerM] = m.includes("haiku") ? [0.1, 0.5] : m.includes("sonnet") ? [2, 10] : m.includes("fable") ? [10, 50] : [4, 20];
  return Math.round(usage.inputTokens * inPerM + usage.outputTokens * outPerM);
}

export function aiAvailable(): boolean {
  return getAiProvider() !== null;
}

/** Monatsverbrauch des Mandanten in Tokens (für Budgetkontrolle und Anzeige). */
export async function monthlyUsage(tenantId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const r = await withTenant(tenantId, (tx) =>
    tx
      .select({ input: sql<number>`coalesce(sum(${aiRequests.inputTokens}),0)::int`, output: sql<number>`coalesce(sum(${aiRequests.outputTokens}),0)::int`, cost: sql<number>`coalesce(sum(${aiRequests.costMicros}),0)::int`, calls: sql<number>`count(*)::int` })
      .from(aiRequests)
      .where(and(eq(aiRequests.tenantId, tenantId), gte(aiRequests.createdAt, start))),
  );
  const u = r[0] ?? { input: 0, output: 0, cost: 0, calls: 0 };
  const budget = env().AI_MONTHLY_TOKEN_BUDGET;
  return { ...u, total: u.input + u.output, budget, exhausted: budget > 0 && u.input + u.output >= budget };
}

async function run<T>(ctx: AuthContext, purpose: string, entity: { type: string; id?: string | null }, call: () => Promise<AiOutcome<T>>): Promise<AiOutcome<T>> {
  const provider = getAiProvider();
  if (!provider) return { ok: false, reason: "error", detail: "Kein KI-Anbieter konfiguriert (AI_PROVIDER)." };
  const usage = await monthlyUsage(ctx.tenantId);
  if (usage.exhausted) {
    await withTenant(ctx.tenantId, (tx) => tx.insert(aiRequests).values({ tenantId: ctx.tenantId, provider: provider.name, model: provider.model, purpose, status: "rejected", error: "Monatsbudget erschöpft", entityType: entity.type, entityId: entity.id ?? null, userId: ctx.userId }));
    return { ok: false, reason: "error", detail: `Monatliches KI-Budget (${usage.budget} Tokens) erschöpft.` };
  }
  const started = Date.now();
  const res = await call();
  await withTenant(ctx.tenantId, (tx) =>
    tx.insert(aiRequests).values({
      tenantId: ctx.tenantId,
      provider: provider.name,
      model: res.usage?.model ?? provider.model,
      purpose,
      status: res.ok ? "success" : res.reason === "refused" ? "rejected" : "failed",
      inputTokens: res.usage?.inputTokens ?? 0,
      outputTokens: res.usage?.outputTokens ?? 0,
      costMicros: res.usage ? costMicros(res.usage) : 0,
      durationMs: Date.now() - started,
      entityType: entity.type,
      entityId: entity.id ?? null,
      error: res.ok ? null : res.detail,
      userId: ctx.userId,
    }),
  );
  if (!res.ok) logger.warn({ purpose, reason: res.reason, detail: res.detail }, "KI-Aufruf ohne Ergebnis");
  return res;
}

/**
 * Extrahiert Anfragedaten aus Freitext. Das Ergebnis wird geschäftlich geprüft:
 * ungültige Daten/Zeiten, unplausible Mengen und unvollständige Angaben werden
 * als Unsicherheit gekennzeichnet statt übernommen. Es bleibt ein Vorschlag.
 */
export async function extractRequestFromText(tenantId: string, text: string, opts: { entityId?: string; ctx?: AuthContext } = {}): Promise<RequestExtraction | null> {
  const ctx = opts.ctx ?? systemContext(tenantId, "ai");
  if (!getAiProvider()) return null;
  const settings = effectiveSettings((await getTenant(tenantId)).settings);
  const provider = getAiProvider()!;
  const res = await run(ctx, "request.extract", { type: "customer_request", id: opts.entityId }, () => provider.extractRequest(text.slice(0, 40_000), { today: new Date().toISOString().slice(0, 10), timezone: settings.timezone }));
  if (!res.ok) return null;
  return sanitizeExtraction(res.data);
}

/** Fachliche Validierung des KI-Vorschlags (nichts Erfundenes, nur plausible Werte). */
export function sanitizeExtraction(raw: RequestExtraction): RequestExtraction {
  const parsed = requestExtractionSchema.safeParse(raw);
  const r: RequestExtraction = parsed.success ? parsed.data : { ...raw, uncertainties: [...(raw.uncertainties ?? []), "Schema nicht erfüllt"], confidence: "low" };
  const unc = new Set(r.uncertainties);
  const validDate = (s: string | null) => (s && !Number.isNaN(new Date(s).getTime()) ? new Date(s).toISOString() : null);
  const startsAt = validDate(r.startsAt);
  const endsAt = validDate(r.endsAt);
  if (r.startsAt && !startsAt) unc.add("Beginn war kein gültiges Datum");
  if (r.endsAt && !endsAt) unc.add("Ende war kein gültiges Datum");
  if (startsAt && endsAt && endsAt <= startsAt) {
    unc.add("Ende liegt nicht nach Beginn");
  }
  if (startsAt && new Date(startsAt) < new Date(Date.now() - 365 * 86_400_000)) unc.add("Beginn liegt weit in der Vergangenheit");
  let headcount = r.headcount;
  if (headcount !== null && (headcount < 1 || headcount > 5000)) {
    unc.add(`Unplausible Personenzahl (${headcount})`);
    headcount = null;
  }
  const roles = (r.requestedRoles ?? []).filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim().slice(0, 80), count: x.count && x.count > 0 && x.count <= 5000 ? x.count : null, qualifications: (x.qualifications ?? []).slice(0, 10) }));
  const email = r.contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contactEmail) ? r.contactEmail.toLowerCase() : null;
  if (r.contactEmail && !email) unc.add("E-Mail-Adresse unvollständig");
  const missing = computeMissingFields({ startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null, locationText: r.locationText, headcount, contactEmail: email, contactPhone: r.contactPhone, customerId: "x" }).filter((f) => f !== "customerId") as RequestExtraction["missingFields"];
  return { ...r, startsAt, endsAt: startsAt && endsAt && endsAt <= startsAt ? null : endsAt, headcount, requestedRoles: roles, contactEmail: email, missingFields: missing, uncertainties: Array.from(unc), confidence: unc.size >= 2 ? "low" : unc.size === 1 ? (r.confidence === "high" ? "medium" : "low") : r.confidence };
}

/** KI-Vorschlag für eine bestehende Anfrage berechnen und am Datensatz speichern (nur Vorschlag). */
export async function suggestForRequest(ctx: AuthContext, requestId: string): Promise<RequestExtraction> {
  requirePermission(ctx, "ai:use", "requests:write");
  const r = (await withTenant(ctx.tenantId, (tx) => tx.select().from(customerRequests).where(and(eq(customerRequests.id, requestId), eq(customerRequests.tenantId, ctx.tenantId))).limit(1)))[0];
  if (!r) throw new NotFoundError("Anfrage nicht gefunden");
  const text = [r.title, r.description, r.rawPayload && typeof r.rawPayload === "object" && "emailText" in (r.rawPayload as object) ? String((r.rawPayload as { emailText?: string }).emailText ?? "") : ""].filter(Boolean).join("\n\n");
  if (!text.trim()) throw new ValidationError("Die Anfrage enthält keinen Text zur Auswertung.");
  const res = await extractRequestFromText(ctx.tenantId, text, { entityId: r.id, ctx });
  if (!res) throw new ConflictError("KI-Auswertung nicht möglich (Anbieter nicht konfiguriert, Budget erschöpft oder Antwort abgelehnt).");
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.update(customerRequests).set({ aiExtraction: res }).where(eq(customerRequests.id, r.id));
    await audit(tx, ctx, { action: "request.ai_suggested", entityType: "customer_request", entityId: r.id, after: { confidence: res.confidence, missing: res.missingFields } });
  });
  return res;
}

/**
 * Übernahme des Vorschlags in die Anfrage – ausdrücklich durch einen Menschen,
 * nur für die gewählten Felder und nur, wo noch kein Wert steht (oder mit overwrite).
 */
export async function applySuggestion(ctx: AuthContext, requestId: string, fields: string[], opts: { overwrite?: boolean } = {}) {
  requirePermission(ctx, "requests:write");
  return withTenant(ctx.tenantId, async (tx) => {
    const r = (await tx.select().from(customerRequests).where(and(eq(customerRequests.id, requestId), eq(customerRequests.tenantId, ctx.tenantId))).limit(1))[0];
    if (!r) throw new NotFoundError();
    if (r.status === "converted") throw new ConflictError("Umgewandelte Anfragen sind nicht änderbar.");
    const s = r.aiExtraction ? sanitizeExtraction(r.aiExtraction as RequestExtraction) : null;
    if (!s) throw new ValidationError("Kein KI-Vorschlag vorhanden.");
    const patch: Partial<typeof r> = {};
    const allowed = new Set(["title", "startsAt", "endsAt", "locationText", "headcount", "contactName", "contactEmail", "contactPhone", "requestedRoles"]);
    for (const f of fields) {
      if (!allowed.has(f)) continue;
      const current = (r as Record<string, unknown>)[f];
      if (current !== null && current !== undefined && current !== "" && !opts.overwrite) continue;
      if (f === "startsAt" || f === "endsAt") {
        const v = s[f];
        if (v) (patch as Record<string, unknown>)[f] = new Date(v);
      } else if (f === "requestedRoles") {
        if (s.requestedRoles.length) patch.requestedRoles = s.requestedRoles.map((x) => ({ name: x.name, count: x.count ?? undefined, qualifications: x.qualifications }));
      } else {
        const v = (s as Record<string, unknown>)[f];
        if (v !== null && v !== undefined) (patch as Record<string, unknown>)[f] = v;
      }
    }
    if (Object.keys(patch).length === 0) throw new ValidationError("Keine Felder übernommen (bereits befüllt oder im Vorschlag leer).");
    const merged = { ...r, ...patch };
    const missingFields = computeMissingFields({ ...merged, customerId: merged.customerId });
    const [row] = await tx.update(customerRequests).set({ ...patch, missingFields, dedupeHash: dedupeHashFor(merged) }).where(eq(customerRequests.id, r.id)).returning();
    await audit(tx, ctx, { action: "request.ai_applied", entityType: "customer_request", entityId: r.id, before: Object.fromEntries(Object.keys(patch).map((k) => [k, (r as Record<string, unknown>)[k]])), after: patch });
    return row!;
  });
}

export async function draftReplyForRequest(ctx: AuthContext, requestId: string, tone: "formal" | "warm" = "warm"): Promise<{ subject: string; body: string }> {
  requirePermission(ctx, "ai:use", "requests:read");
  const r = (await withTenant(ctx.tenantId, (tx) => tx.select().from(customerRequests).where(and(eq(customerRequests.id, requestId), eq(customerRequests.tenantId, ctx.tenantId))).limit(1)))[0];
  if (!r) throw new NotFoundError();
  const provider = getAiProvider();
  if (!provider) throw new ConflictError("Kein KI-Anbieter konfiguriert.");
  const facts = { title: r.title, contactName: r.contactName, startsAt: r.startsAt, endsAt: r.endsAt, locationText: r.locationText, headcount: r.headcount, missingFields: r.missingFields, description: r.description, status: r.status };
  const res = await run(ctx, "request.draft_reply", { type: "customer_request", id: r.id }, () => provider.draftReply(facts, tone));
  if (!res.ok) throw new ConflictError(`Entwurf nicht möglich: ${res.detail}`);
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, { action: "request.ai_draft_reply", entityType: "customer_request", entityId: r.id }));
  return res.data;
}

export async function explainReconciliationItem(ctx: AuthContext, itemId: string): Promise<DeviationExplanation> {
  requirePermission(ctx, "ai:use", "time:read");
  const provider = getAiProvider();
  if (!provider) throw new ConflictError("Kein KI-Anbieter konfiguriert.");
  const facts = await withTenant(ctx.tenantId, async (tx) => {
    const it = (await tx.select().from(reconciliationItems).where(and(eq(reconciliationItems.id, itemId), eq(reconciliationItems.tenantId, ctx.tenantId))).limit(1))[0];
    if (!it) throw new NotFoundError();
    const emp = it.employeeId ? (await tx.select({ n: employees.employeeNumber }).from(employees).where(eq(employees.id, it.employeeId)).limit(1))[0] : null;
    const sh = it.shiftId ? (await tx.select({ s: shifts, ev: events.name }).from(shifts).innerJoin(events, eq(events.id, shifts.eventId)).where(eq(shifts.id, it.shiftId)).limit(1))[0] : null;
    // Nur dispositionsrelevante Fakten, keine Namen (Datensparsamkeit)
    return { kind: it.kind, plannedStart: it.plannedStart, plannedEnd: it.plannedEnd, actualStart: it.actualStart, actualEnd: it.actualEnd, deviationMinutes: it.deviationMinutes, employeeNumber: emp?.n, eventName: sh?.ev, plannedBreak: sh?.s.breakMinutes, status: it.status };
  });
  const res = await run(ctx, "reconciliation.explain", { type: "reconciliation_item", id: itemId }, () => provider.explainDeviation(facts));
  if (!res.ok) throw new ConflictError(`Erklärung nicht möglich: ${res.detail}`);
  return res.data;
}

export async function summarizeDocumentById(ctx: AuthContext, documentId: string): Promise<DocumentSummary> {
  requirePermission(ctx, "ai:use", "documents:read");
  const provider = getAiProvider();
  if (!provider) throw new ConflictError("Kein KI-Anbieter konfiguriert.");
  const d = (await withTenant(ctx.tenantId, (tx) => tx.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.tenantId, ctx.tenantId))).limit(1)))[0];
  if (!d || d.deletedAt) throw new NotFoundError();
  if (d.confidentiality === "confidential") requirePermission(ctx, "documents:confidential");
  if (!["text/plain", "text/csv"].includes(d.mimeType)) throw new ValidationError("Zusammenfassung derzeit nur für Textdateien (TXT/CSV). PDF-Textextraktion ist nicht eingebaut.");
  const text = (await storage().get(d.storageKey)).toString("utf8");
  const res = await run(ctx, "document.summarize", { type: "document", id: d.id }, () => provider.summarizeDocument(text));
  if (!res.ok) throw new ConflictError(`Zusammenfassung nicht möglich: ${res.detail}`);
  return res.data;
}
