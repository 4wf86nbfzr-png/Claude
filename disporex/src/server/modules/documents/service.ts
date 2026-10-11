import { and, eq, sql, desc, isNull, lte, isNotNull, asc } from "drizzle-orm";
import { z } from "zod";
import { withTenant, withSystem } from "../../db/client";
import { documents, documentAccessTokens, employees, customers, partners, events, memberships } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requireAny, requirePermission } from "../../auth/context";
import { ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { randomToken, sha256 } from "../../core/crypto";
import { storage } from "../../storage";
import { env } from "../../core/env";
import { emitEvent } from "../../core/events";
import { notifyRoles } from "../notifications/service";

export type DocEntityType = "employee" | "customer" | "partner" | "event" | "tenant" | "request" | "time_import";

const MAX_BYTES = 20 * 1024 * 1024;

/** Erlaubte Typen mit Magic-Bytes-Prüfung (Inhalt muss zum deklarierten Typ passen). */
const ALLOWED: Record<string, { ext: string[]; magic: (b: Buffer) => boolean }> = {
  "application/pdf": { ext: ["pdf"], magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: ["png"], magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "text/csv": { ext: ["csv"], magic: (b) => !b.subarray(0, 512).includes(0) },
  "text/plain": { ext: ["txt"], magic: (b) => !b.subarray(0, 512).includes(0) },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
};

export const CATEGORIES = ["general", "contract", "certificate", "id", "insurance", "briefing", "invoice", "import", "other"] as const;
export const CATEGORY_LABELS: Record<string, string> = {
  general: "Allgemein",
  contract: "Vertrag",
  certificate: "Nachweis / Zertifikat",
  id: "Ausweisdokument",
  insurance: "Versicherung",
  briefing: "Briefing / Einsatzunterlage",
  invoice: "Rechnung / Abrechnung",
  import: "Importdatei",
  other: "Sonstiges",
};

export const uploadInput = z.object({
  entityType: z.enum(["employee", "customer", "partner", "event", "tenant", "request", "time_import"]),
  entityId: z.string().uuid(),
  category: z.enum(CATEGORIES).default("general"),
  title: z.string().trim().min(1).max(200),
  confidentiality: z.enum(["internal", "confidential", "shared"]).default("internal"),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("").transform(() => null)),
  replacesDocumentId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
});

function requireReadFor(ctx: AuthContext, d: { entityType: string; entityId: string; confidentiality: string }) {
  // Portalrollen: nur "shared"-Dokumente des eigenen Objekts
  if (ctx.role === "employee" || ctx.role === "customer" || ctx.role === "partner") {
    const own = (ctx.role === "employee" && d.entityType === "employee" && d.entityId === ctx.employeeId) || (ctx.role === "customer" && d.entityType === "customer" && d.entityId === ctx.customerId) || (ctx.role === "partner" && d.entityType === "partner" && d.entityId === ctx.partnerId);
    if (!own || d.confidentiality !== "shared") throw new ForbiddenError("Kein Zugriff auf dieses Dokument.");
    return;
  }
  requirePermission(ctx, "documents:read");
  if (d.entityType === "employee") requirePermission(ctx, "employees:documents");
  if (d.confidentiality === "confidential") requirePermission(ctx, "documents:confidential");
}

function requireWriteFor(ctx: AuthContext, entityType: string, confidentiality: string) {
  requirePermission(ctx, "documents:write");
  if (entityType === "employee") requirePermission(ctx, "employees:documents");
  if (confidentiality === "confidential") requirePermission(ctx, "documents:confidential");
}

async function ensureEntityExists(tenantId: string, entityType: string, entityId: string) {
  return withTenant(tenantId, async (tx) => {
    const table = { employee: employees, customer: customers, partner: partners, event: events }[entityType as "employee"];
    if (!table) return entityType === "tenant" ? entityId === tenantId : true;
    const r = await tx.select({ id: table.id }).from(table).where(eq(table.id, entityId)).limit(1);
    return Boolean(r[0]);
  });
}

/**
 * Upload: Typ-, Größen- und Inhaltsprüfung, Hash, Speicherung unter zufälligem
 * Schlüssel, optional als neue Version eines bestehenden Dokuments.
 */
export async function uploadDocument(ctx: AuthContext, meta: z.infer<typeof uploadInput>, file: { filename: string; mimeType: string; data: Buffer }) {
  const m = uploadInput.parse(meta);
  requireWriteFor(ctx, m.entityType, m.confidentiality);
  if (file.data.length === 0) throw new ValidationError("Leere Datei.");
  if (file.data.length > MAX_BYTES) throw new ValidationError("Datei zu groß (max. 20 MB).");
  const ext = file.filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.mimeType === "application/octet-stream" ? Object.entries(ALLOWED).find(([, v]) => v.ext.includes(ext))?.[0] ?? file.mimeType : file.mimeType;
  const rule = ALLOWED[mime];
  if (!rule) throw new ValidationError(`Dateityp nicht erlaubt (${mime}). Erlaubt: PDF, JPG, PNG, CSV, TXT, XLSX, DOCX.`);
  if (!rule.ext.includes(ext)) throw new ValidationError(`Dateiendung .${ext} passt nicht zum Typ ${mime}.`);
  if (!rule.magic(file.data)) throw new ValidationError("Dateiinhalt passt nicht zum angegebenen Typ.");
  if (!(await ensureEntityExists(ctx.tenantId, m.entityType, m.entityId))) throw new NotFoundError("Zugehöriges Objekt nicht gefunden.");

  const hash = sha256(file.data);
  const key = `${ctx.tenantId}/${m.entityType}/${m.entityId}/${randomToken(16)}.${ext}`;
  await storage().put(key, file.data, mime);
  return withTenant(ctx.tenantId, async (tx) => {
    let version = 1;
    if (m.replacesDocumentId) {
      const prev = (await tx.select().from(documents).where(and(eq(documents.id, m.replacesDocumentId), eq(documents.tenantId, ctx.tenantId))).limit(1))[0];
      if (!prev) throw new NotFoundError("Vorgängerdokument nicht gefunden");
      version = prev.version + 1;
      await tx.update(documents).set({ deletedAt: new Date(), deletedBy: ctx.userId }).where(eq(documents.id, prev.id));
    }
    const safeName = file.filename.replace(/[^\w.\-äöüÄÖÜß ]/g, "_").slice(0, 200);
    const [row] = await tx
      .insert(documents)
      .values({
        tenantId: ctx.tenantId,
        entityType: m.entityType,
        entityId: m.entityId,
        category: m.category,
        title: m.title,
        filename: safeName,
        mimeType: mime,
        sizeBytes: file.data.length,
        storageKey: key,
        sha256: hash,
        version,
        previousVersionId: m.replacesDocumentId ?? null,
        confidentiality: m.confidentiality,
        expiresAt: m.expiresAt ?? null,
        uploadedBy: ctx.userId,
      })
      .returning();
    await audit(tx, ctx, { action: "document.uploaded", entityType: "document", entityId: row!.id, after: { title: m.title, entityType: m.entityType, entityId: m.entityId, version, sizeBytes: file.data.length, sha256: hash } });
    return row!;
  });
}

export async function listDocuments(ctx: AuthContext, filter: { entityType?: DocEntityType; entityId?: string; category?: string; expiringDays?: number; q?: string } = {}) {
  requireAny(ctx, "documents:read", "portal:employee", "portal:customer", "portal:partner");
  const conds = [eq(documents.tenantId, ctx.tenantId), isNull(documents.deletedAt)];
  if (ctx.role === "employee") conds.push(eq(documents.entityType, "employee"), eq(documents.entityId, ctx.employeeId ?? "00000000-0000-0000-0000-000000000000"), eq(documents.confidentiality, "shared"));
  else if (ctx.role === "customer") conds.push(eq(documents.entityType, "customer"), eq(documents.entityId, ctx.customerId ?? "00000000-0000-0000-0000-000000000000"), eq(documents.confidentiality, "shared"));
  else if (ctx.role === "partner") conds.push(eq(documents.entityType, "partner"), eq(documents.entityId, ctx.partnerId ?? "00000000-0000-0000-0000-000000000000"), eq(documents.confidentiality, "shared"));
  else {
    if (!ctx.permissions.has("employees:documents")) conds.push(sql`${documents.entityType} <> 'employee'`);
    if (!ctx.permissions.has("documents:confidential")) conds.push(sql`${documents.confidentiality} <> 'confidential'`);
  }
  if (filter.entityType) conds.push(eq(documents.entityType, filter.entityType));
  if (filter.entityId) conds.push(eq(documents.entityId, filter.entityId));
  if (filter.category) conds.push(eq(documents.category, filter.category));
  if (filter.expiringDays !== undefined) conds.push(isNotNull(documents.expiresAt), lte(documents.expiresAt, new Date(Date.now() + filter.expiringDays * 86_400_000).toISOString().slice(0, 10)));
  if (filter.q) conds.push(sql`(${documents.title} ilike ${"%" + filter.q + "%"} or ${documents.filename} ilike ${"%" + filter.q + "%"})`);
  return withTenant(ctx.tenantId, (tx) => tx.select().from(documents).where(and(...conds)).orderBy(filter.expiringDays !== undefined ? asc(documents.expiresAt) : desc(documents.createdAt)).limit(500));
}

export async function getDocument(ctx: AuthContext, id: string) {
  const d = (await withTenant(ctx.tenantId, (tx) => tx.select().from(documents).where(and(eq(documents.id, id), eq(documents.tenantId, ctx.tenantId))).limit(1)))[0];
  if (!d || d.deletedAt) throw new NotFoundError("Dokument nicht gefunden");
  requireReadFor(ctx, d);
  const versions = await withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: documents.id, version: documents.version, createdAt: documents.createdAt, filename: documents.filename, deletedAt: documents.deletedAt })
      .from(documents)
      .where(and(eq(documents.entityType, d.entityType), eq(documents.entityId, d.entityId), eq(documents.title, d.title)))
      .orderBy(desc(documents.version)),
  );
  return { document: d, versions };
}

/** Erzeugt einen zeitlich begrenzten Download-Link (Token nur als Hash gespeichert). */
export async function createDownloadLink(ctx: AuthContext, id: string, ttlMinutes = 10): Promise<string> {
  const { document: d } = await getDocument(ctx, id);
  const token = randomToken(32);
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.insert(documentAccessTokens).values({ tenantId: ctx.tenantId, documentId: d.id, tokenHash: sha256(token), userId: ctx.userId, expiresAt: new Date(Date.now() + ttlMinutes * 60_000) });
    await audit(tx, ctx, { action: "document.download_link", entityType: "document", entityId: d.id });
  });
  return `${env().APP_URL}/api/documents/${token}`;
}

/** Löst einen Download-Token ein (einmalig innerhalb der Frist). */
export async function resolveDownloadToken(token: string): Promise<{ document: typeof documents.$inferSelect; data: Buffer } | null> {
  const row = await withSystem(async (tx) => {
    const t = (await tx.select().from(documentAccessTokens).where(and(eq(documentAccessTokens.tokenHash, sha256(token)), isNull(documentAccessTokens.usedAt), sql`${documentAccessTokens.expiresAt} > now()`)).limit(1))[0];
    if (!t) return null;
    await tx.update(documentAccessTokens).set({ usedAt: new Date() }).where(eq(documentAccessTokens.id, t.id));
    const d = (await tx.select().from(documents).where(eq(documents.id, t.documentId)).limit(1))[0];
    return d && !d.deletedAt ? d : null;
  });
  if (!row) return null;
  const data = await storage().get(row.storageKey);
  return { document: row, data };
}

export async function deleteDocument(ctx: AuthContext, id: string, reason?: string) {
  const { document: d } = await getDocument(ctx, id);
  requireWriteFor(ctx, d.entityType, d.confidentiality);
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.update(documents).set({ deletedAt: new Date(), deletedBy: ctx.userId }).where(eq(documents.id, id));
    await audit(tx, ctx, { action: "document.deleted", entityType: "document", entityId: id, reason });
  });
}

/** Endgültiges Entfernen gelöschter Dokumente nach Frist (Worker). */
export async function purgeDeletedDocuments(olderThanDays = 30): Promise<number> {
  const rows = await withSystem((tx) => tx.select().from(documents).where(and(isNotNull(documents.deletedAt), lte(documents.deletedAt, new Date(Date.now() - olderThanDays * 86_400_000)))));
  for (const d of rows) {
    await storage()
      .delete(d.storageKey)
      .catch(() => undefined);
    await withSystem((tx) => tx.delete(documents).where(eq(documents.id, d.id)));
  }
  return rows.length;
}

/** Worker: Erinnerungen an ablaufende Dokumente (30 Tage), je Dokument einmal. */
export async function remindExpiringDocuments(ctx: AuthContext, days = 30): Promise<number> {
  return withTenant(ctx.tenantId, async (tx) => {
    const limit = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const rows = await tx.select().from(documents).where(and(eq(documents.tenantId, ctx.tenantId), isNull(documents.deletedAt), isNotNull(documents.expiresAt), lte(documents.expiresAt, limit), isNull(documents.reminderSentAt)));
    for (const d of rows) {
      await notifyRoles(tx, ctx.tenantId, d.entityType === "employee" ? ["hr", "tenant_admin"] : ["dispatcher", "tenant_admin"], {
        kind: "document.expiring",
        title: `Dokument läuft ab: ${d.title}`,
        body: `Gültig bis ${d.expiresAt}. Bitte Nachweis erneuern.`,
        link: `/dokumente/${d.id}`,
        priority: "normal",
        dedupeKey: `doc.expiring:${d.id}`,
      });
      await emitEvent(tx, { tenantId: ctx.tenantId, type: "document.expiring", entityType: "document", entityId: d.id, payload: { id: d.id, title: d.title, expiresAt: d.expiresAt, entityType: d.entityType, entityId: d.entityId } });
      await tx.update(documents).set({ reminderSentAt: new Date() }).where(eq(documents.id, d.id));
    }
    void memberships;
    return rows.length;
  });
}
