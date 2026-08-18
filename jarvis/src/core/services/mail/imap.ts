import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { EingehendeNachricht, MailReader } from './types';

export interface ImapOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string | null;
  mailbox: string;
}

/**
 * Liest den Posteingang, damit Antworten dem angeschriebenen Unternehmen
 * zugeordnet werden können (§3). Es wird nur gelesen – nichts verschoben,
 * nichts gelöscht, nichts als gelesen markiert.
 */
export class ImapReader implements MailReader {
  readonly id = 'imap';

  constructor(private readonly options: ImapOptions) {}

  configured(): boolean {
    return Boolean(this.options.host && this.options.user && this.options.password);
  }

  missingHint(): string {
    const fehlt: string[] = [];
    if (!this.options.host) fehlt.push('IMAP_HOST');
    if (!this.options.user) fehlt.push('IMAP_USER');
    if (!this.options.password) fehlt.push('IMAP_PASSWORD');
    return fehlt.length ? `Es fehlt: ${fehlt.join(', ')}.` : 'IMAP ist eingerichtet.';
  }

  async hole(seit: Date, maxAnzahl = 50): Promise<EingehendeNachricht[]> {
    if (!this.configured()) throw new Error(`IMAP ist nicht eingerichtet. ${this.missingHint()}`);
    const client = new ImapFlow({
      host: this.options.host,
      port: this.options.port,
      secure: this.options.secure,
      auth: { user: this.options.user, pass: this.options.password ?? '' },
      logger: false
    });
    const nachrichten: EingehendeNachricht[] = [];
    await client.connect();
    try {
      const lock = await client.getMailboxLock(this.options.mailbox);
      try {
        for await (const nachricht of client.fetch({ since: seit }, { envelope: true, source: true })) {
          if (nachrichten.length >= maxAnzahl) break;
          if (!nachricht.source) continue;
          const geparst: ParsedMail = await simpleParser(nachricht.source);
          nachrichten.push({
            messageId: geparst.messageId ?? null,
            inReplyTo: geparst.inReplyTo ?? null,
            from: geparst.from?.value?.[0]?.address ?? '',
            to: (Array.isArray(geparst.to) ? geparst.to : geparst.to ? [geparst.to] : []).flatMap((eintrag) =>
              eintrag.value.map((wert) => wert.address ?? '').filter(Boolean)
            ),
            subject: geparst.subject ?? '(kein Betreff)',
            text: (geparst.text ?? '').trim(),
            date: (geparst.date ?? new Date()).toISOString()
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return nachrichten;
  }
}
