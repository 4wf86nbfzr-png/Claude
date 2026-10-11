import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { withTenant, withSystem } from "../../db/client";
import { inboundEmails, customers, customerContacts, customerRequests, tenants } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission, systemContext } from "../../auth/context";
import { NotFoundError } from "../../core/errors";
import { audit } from "../../core/audit";
import { createRequest } from "../requests/service";
import { extractRequestFromText } from "../ai/service";
import { uploadDocument } from "../documents/service";
import { logger } from "../../core/logger";
import { sha256 } from "../../core/crypto";

export const inboundEmailInput = z.object({
  messageId: z.string().trim().min(3).max(500),
  from: z.object({ address: z.string().trim().toLowerCase().email().max(254), name: z.string().max(200).optional().nullable() }),
  subject: z.string().max(500).optional().nullable(),
  text: z.string().max(200_000).optional().nullable(),
  html: z.string().max(400_000).optional().nullable(),
  receivedAt: z.coerce.date().optional(),
  attachments: z.array(z.object({ filename: z.string().max(200), mimeType: z.string().max(100), contentBase64: z.string().max(30_000_000) })).max(20).default([]),
});
export type InboundEmailInput = z.input<typeof inboundEmailInput>;

/** Sehr einfache HTML-zu-Text-Umwandlung für Mails ohne Textteil. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type IngestResult = { emailId: string; status: "processed" | "duplicate" | "ignored"; requestId?: string; customerId?: string | null; aiUsed: boolean };

/**
 * Verarbeitet eine eingehende E-Mail zu einem Anfrageentwurf:
 * 1. Deduplizierung über Message-ID
 * 2. Kundenzuordnung über Absenderadresse (Kunde oder Ansprechpartner)
 * 3. Anfrage (Status "new", Quelle "email") mit Rohtext; Duplikaterkennung der Anfrage greift
 * 4. Optional KI-Extraktion als Vorschlag (nie automatisch verbindlich)
 * 5. Anhänge als Dokumente der Anfrage (geprüfte Typen), sonst nur protokolliert
 * Es wird nichts versendet und kein Auftrag erzeugt.
 */
export async function ingestInboundEmail(ctx: AuthContext, input: InboundEmailInput): Promise<IngestResult> {
  requirePermission(ctx, "requests:write");
  const data = inboundEmailInput.parse(input);
  const text = (data.text?.trim() || (data.html ? htmlToText(data.html) : "")).slice(0, 100_000);
  return withTenant(ctx.tenantId, async (tx) => {
    const existing = (await tx.select().from(inboundEmails).where(and(eq(inboundEmails.tenantId, ctx.tenantId), eq(inboundEmails.messageId, data.messageId))).limit(1))[0];
    if (existing) return { emailId: existing.id, status: "duplicate", requestId: existing.requestId ?? undefined, customerId: existing.customerId, aiUsed: false };

    const [mail] = await tx
      .insert(inboundEmails)
      .values({ tenantId: ctx.tenantId, messageId: data.messageId, fromAddress: data.from.address, fromName: data.from.name ?? null, subject: data.subject ?? null, bodyText: text, receivedAt: data.receivedAt ?? new Date(), attachments: data.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType, sizeBytes: Math.floor((a.contentBase64.length * 3) / 4) })), status: "new" })
      .returning();

    // Kundenzuordnung: zentrale Adresse oder Ansprechpartner; sonst Domain-Treffer (nur eindeutig)
    let customerId: string | null = null;
    const direct = (await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.email, data.from.address))).limit(2));
    if (direct.length === 1) customerId = direct[0]!.id;
    if (!customerId) {
      const viaContact = await tx.select({ customerId: customerContacts.customerId }).from(customerContacts).where(and(eq(customerContacts.tenantId, ctx.tenantId), eq(customerContacts.email, data.from.address))).limit(2);
      if (viaContact.length === 1) customerId = viaContact[0]!.customerId;
    }
    if (!customerId) {
      const domain = data.from.address.split("@")[1] ?? "";
      if (domain && !["gmail.com", "web.de", "gmx.de", "gmx.net", "outlook.com", "hotmail.com", "yahoo.de", "icloud.com", "t-online.de"].includes(domain)) {
        const byDomain = await tx.execute<{ id: string }>(sqlDomainLookup(ctx.tenantId, domain));
        if (byDomain.rows.length === 1) customerId = byDomain.rows[0]!.id;
      }
    }

    const title = (data.subject?.trim() || text.split("\n")[0]?.slice(0, 120) || "E-Mail-Anfrage").slice(0, 200);
    const created = await createRequest(ctx, {
      customerId,
      title: title.length < 3 ? `Anfrage von ${data.from.address}` : title,
      description: text.slice(0, 8000),
      contactName: data.from.name ?? null,
      contactEmail: data.from.address,
      source: "email",
      externalRef: `email:${sha256(data.messageId).slice(0, 32)}`,
    });
    const reqId = created.request.id;
    await tx.update(customerRequests).set({ rawPayload: { emailMessageId: data.messageId, from: data.from, subject: data.subject ?? null, emailText: text, attachments: data.attachments.map((a) => a.filename) } }).where(eq(customerRequests.id, reqId));

    // Anhänge als Dokumente (nur erlaubte Typen; Fehler blockieren die Anfrage nicht)
    let stored = 0;
    for (const a of data.attachments) {
      try {
        const buf = Buffer.from(a.contentBase64, "base64");
        if (buf.length === 0) continue;
        await uploadDocument(ctx, { entityType: "request", entityId: reqId, category: "general", title: a.filename, confidentiality: "internal", expiresAt: null, replacesDocumentId: null }, { filename: a.filename, mimeType: a.mimeType, data: buf });
        stored++;
      } catch (err) {
        logger.info({ err: err instanceof Error ? err.message : err, filename: a.filename }, "E-Mail-Anhang nicht übernommen");
      }
    }

    // KI-Vorschlag (optional)
    let aiUsed = false;
    if (text.length > 20) {
      const extraction = await extractRequestFromText(ctx.tenantId, `Betreff: ${data.subject ?? ""}\n\n${text}`, { entityId: reqId, ctx }).catch(() => null);
      if (extraction) {
        aiUsed = true;
        await tx.update(customerRequests).set({ aiExtraction: extraction }).where(eq(customerRequests.id, reqId));
      }
    }
    await tx.update(inboundEmails).set({ status: "processed", customerId, requestId: reqId }).where(eq(inboundEmails.id, mail!.id));
    await audit(tx, ctx, { action: "email.ingested", entityType: "inbound_email", entityId: mail!.id, after: { requestId: reqId, customerId, attachmentsStored: stored, aiUsed, duplicateRequest: created.duplicate } });
    return { emailId: mail!.id, status: "processed", requestId: reqId, customerId, aiUsed };
  });
}

import { sql } from "drizzle-orm";
function sqlDomainLookup(tenantId: string, domain: string) {
  return sql`select id from customers where tenant_id = ${tenantId} and lower(split_part(coalesce(email,''), '@', 2)) = ${domain.toLowerCase()} limit 2`;
}

export async function listInboundEmails(ctx: AuthContext, limit = 100) {
  requirePermission(ctx, "requests:read");
  return withTenant(ctx.tenantId, (tx) => tx.select().from(inboundEmails).where(eq(inboundEmails.tenantId, ctx.tenantId)).orderBy(desc(inboundEmails.receivedAt)).limit(limit));
}

export async function ignoreInboundEmail(ctx: AuthContext, id: string) {
  requirePermission(ctx, "requests:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.update(inboundEmails).set({ status: "ignored" }).where(and(eq(inboundEmails.id, id), eq(inboundEmails.tenantId, ctx.tenantId))).returning({ id: inboundEmails.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "email.ignored", entityType: "inbound_email", entityId: id });
  });
}

/** Mandant, dem ein IMAP-Postfach zugeordnet ist (derzeit: erster aktiver Mandant, siehe Doku). */
export async function imapTargetTenant(): Promise<string | null> {
  const t = (await withSystem((tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, "active")).orderBy(tenants.createdAt).limit(1)))[0];
  return t?.id ?? null;
}

export { systemContext };
