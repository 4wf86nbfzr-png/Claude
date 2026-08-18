import { ImapFlow } from 'imapflow';
import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { IncomingMessage, MailReader } from './types.js';

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
}

/**
 * Reads the inbox so replies can be matched back to the company that was
 * contacted (§3). Read-only: nothing is moved, flagged or deleted.
 */
export class ImapReader implements MailReader {
  readonly name = 'IMAP';

  constructor(private readonly config: ImapConfig) {}

  private client(): ImapFlow {
    return new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
    });
  }

  async fetchRecent(sinceIso: string, limit: number): Promise<Result<IncomingMessage[], JarvisError>> {
    const client = this.client();
    try {
      await client.connect();
      const lock = await client.getMailboxLock(this.config.mailbox || 'INBOX');
      try {
        const messages: IncomingMessage[] = [];
        const since = new Date(sinceIso);
        for await (const message of client.fetch(
          { since },
          { envelope: true, uid: true, headers: ['message-id', 'in-reply-to', 'references'] },
        )) {
          const headers = parseHeaders(message.headers);
          messages.push({
            uid: message.uid,
            messageId: message.envelope?.messageId ?? headers['message-id'] ?? null,
            inReplyTo: message.envelope?.inReplyTo ?? headers['in-reply-to'] ?? null,
            references: (headers['references'] ?? '')
              .split(/\s+/)
              .map((value) => value.trim())
              .filter(Boolean),
            from: message.envelope?.from?.[0]?.address ?? '',
            subject: message.envelope?.subject ?? '',
            date: (message.envelope?.date ?? new Date()).toISOString(),
            snippet: message.envelope?.subject ?? '',
          });
        }
        messages.sort((a, b) => b.date.localeCompare(a.date));
        return ok(messages.slice(0, limit));
      } finally {
        lock.release();
      }
    } catch (error) {
      return err(translateImap(error));
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async verify(): Promise<Result<string, JarvisError>> {
    const client = this.client();
    try {
      await client.connect();
      const lock = await client.getMailboxLock(this.config.mailbox || 'INBOX');
      lock.release();
      return ok(`IMAP-Verbindung zu ${this.config.host} steht (${this.config.mailbox || 'INBOX'}).`);
    } catch (error) {
      return err(translateImap(error));
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}

function parseHeaders(raw: Buffer | undefined): Record<string, string> {
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const line of raw.toString('utf8').split(/\r?\n(?![ \t])/)) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    result[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return result;
}

function translateImap(error: unknown): JarvisError {
  const message = error instanceof Error ? error.message : String(error);
  if (/auth/i.test(message)) {
    return makeError('mail.auth', 'Der IMAP-Server hat die Zugangsdaten abgelehnt.', {
      hint: 'Viele Anbieter verlangen ein App-Passwort für IMAP.',
      detail: message.slice(0, 300),
    });
  }
  return makeError('mail.connection', 'Der IMAP-Server ist nicht erreichbar.', {
    detail: message.slice(0, 300),
    retryable: true,
  });
}
