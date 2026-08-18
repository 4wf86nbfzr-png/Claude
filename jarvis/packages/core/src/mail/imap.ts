import type { JarvisEnv } from '../config/env.js';
import type { CredentialService } from '../services/credentials.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import type { IncomingMessage, MailReader } from './types.js';
import { htmlToText, normalizeWhitespace } from '../util/text.js';

/**
 * Liest den Posteingang ueber IMAP, damit Antworten einer Firma zugeordnet
 * werden koennen. Bewusst nur lesend -- geloescht oder verschoben wird nichts.
 */
export class ImapReader implements MailReader {
  readonly id = 'imap';

  constructor(
    private readonly env: JarvisEnv,
    private readonly credentials: CredentialService,
  ) {}

  private config(): { host: string; port: number; secure: boolean; user: string; pass: string } | null {
    const host = this.credentials.get('IMAP_HOST') ?? this.env.IMAP_HOST;
    const user = this.credentials.get('IMAP_USER') ?? this.env.IMAP_USER ?? this.env.SMTP_USER;
    const pass = this.credentials.get('IMAP_PASSWORD') ?? this.env.IMAP_PASSWORD ?? this.env.SMTP_PASSWORD;
    if (!host || !user || !pass) return null;
    const port = Number(this.credentials.get('IMAP_PORT') ?? this.env.IMAP_PORT ?? 993);
    return { host, port, secure: this.env.IMAP_SECURE ?? port === 993, user, pass };
  }

  isConfigured(): boolean {
    return this.config() !== null;
  }

  missingConfigHint(): string | null {
    if (this.isConfigured()) return null;
    return 'IMAP ist nicht konfiguriert (IMAP_HOST, IMAP_USER, IMAP_PASSWORD). Ohne IMAP können eingehende Antworten nicht zugeordnet werden.';
  }

  async fetchSince(since: Date, limit = 50): Promise<Result<IncomingMessage[]>> {
    const cfg = this.config();
    if (!cfg) return err('NOT_CONFIGURED', this.missingConfigHint() ?? 'IMAP nicht konfiguriert.');

    // Dynamischer Import: imapflow zieht viel nach, wird aber nur hier gebraucht.
    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');

    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      const out: IncomingMessage[] = [];
      try {
        const uids = await client.search({ since });
        const selected = (Array.isArray(uids) ? uids : []).slice(-limit);
        for await (const msg of client.fetch(selected, { source: true, envelope: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const fromAddr = parsed.from?.value?.[0];
          out.push({
            messageId: parsed.messageId ?? null,
            from: fromAddr?.address ?? '',
            fromName: fromAddr?.name ?? null,
            to: toAddresses(parsed.to),
            subject: parsed.subject ?? '(ohne Betreff)',
            text: normalizeWhitespace(parsed.text ?? (parsed.html ? htmlToText(String(parsed.html)) : '')),
            date: (parsed.date ?? new Date()).toISOString(),
            inReplyTo: parsed.inReplyTo ?? null,
            references: Array.isArray(parsed.references)
              ? parsed.references
              : parsed.references
                ? [parsed.references]
                : [],
          });
        }
      } finally {
        lock.release();
      }
      await client.logout();
      return ok(out);
    } catch (e) {
      try {
        await client.close();
      } catch {
        /* Verbindung war schon weg */
      }
      return fromException(e, 'PROVIDER_ERROR');
    }
  }
}

function toAddresses(value: unknown): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of list) {
    const v = (entry as { value?: Array<{ address?: string }> }).value ?? [];
    for (const a of v) if (a.address) out.push(a.address);
  }
  return out;
}
