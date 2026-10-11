import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "../../core/env";
import { logger } from "../../core/logger";
import { ingestInboundEmail, imapTargetTenant } from "./inbound";
import { systemContext } from "../../auth/context";

export function imapConfigured(): boolean {
  const e = env();
  return Boolean(e.IMAP_HOST && e.IMAP_USER && e.IMAP_PASS);
}

/**
 * Holt ungelesene Nachrichten aus dem konfigurierten IMAP-Postfach, verarbeitet sie
 * zu Anfrageentwürfen und markiert sie als gelesen. Läuft im Worker (Wartungslauf).
 * Mehrmandantenbetrieb: ein Postfach je Installation; die Zuordnung zum Mandanten
 * erfolgt über IMAP_TENANT_ID oder den ersten aktiven Mandanten.
 */
export async function pollImapInbox(opts: { max?: number } = {}): Promise<{ fetched: number; processed: number; duplicates: number; failed: number }> {
  const e = env();
  const result = { fetched: 0, processed: 0, duplicates: 0, failed: 0 };
  if (!imapConfigured()) return result;
  const tenantId = process.env.IMAP_TENANT_ID ?? (await imapTargetTenant());
  if (!tenantId) return result;
  const ctx = systemContext(tenantId, "imap");
  const client = new ImapFlow({ host: e.IMAP_HOST!, port: e.IMAP_PORT, secure: e.IMAP_PORT === 993, auth: { user: e.IMAP_USER!, pass: e.IMAP_PASS! }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(e.IMAP_FOLDER);
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      const list = (Array.isArray(uids) ? uids : []).slice(0, opts.max ?? 50);
      for (const uid of list) {
        result.fetched++;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0];
          if (!from?.address) {
            result.failed++;
            continue;
          }
          const r = await ingestInboundEmail(ctx, {
            messageId: parsed.messageId ?? `imap-${uid}-${from.address}`,
            from: { address: from.address, name: from.name || null },
            subject: parsed.subject ?? null,
            text: parsed.text ?? null,
            html: typeof parsed.html === "string" ? parsed.html : null,
            receivedAt: parsed.date ?? new Date(),
            attachments: (parsed.attachments ?? []).slice(0, 20).map((a) => ({ filename: a.filename ?? "anhang", mimeType: a.contentType, contentBase64: a.content.toString("base64") })),
          });
          if (r.status === "duplicate") result.duplicates++;
          else result.processed++;
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        } catch (err) {
          result.failed++;
          logger.error({ err, uid }, "IMAP-Nachricht konnte nicht verarbeitet werden");
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return result;
}
