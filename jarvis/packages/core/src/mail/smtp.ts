import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { MailTransport, OutgoingMessage, SendOutcome } from './types.js';
import { toNodemailerOptions } from './mime.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import type { CredentialService } from '../services/credentials.js';
import type { JarvisEnv } from '../config/env.js';

/**
 * Klassischer Versand ueber SMTP. Funktioniert mit jedem Postfach --
 * auch dort, wo es keine API gibt (typisch bei Firmen-Hostern).
 */
export class SmtpTransport implements MailTransport {
  readonly id = 'smtp' as const;
  readonly label = 'SMTP';
  private transporter: Transporter | null = null;

  constructor(
    private readonly env: JarvisEnv,
    private readonly credentials: CredentialService,
  ) {}

  private config(): { host: string; port: number; secure: boolean; user: string; pass: string } | null {
    const host = this.credentials.get('SMTP_HOST') ?? this.env.SMTP_HOST;
    const user = this.credentials.get('SMTP_USER') ?? this.env.SMTP_USER;
    const pass = this.credentials.get('SMTP_PASSWORD') ?? this.env.SMTP_PASSWORD;
    if (!host || !user || !pass) return null;
    const port = Number(this.credentials.get('SMTP_PORT') ?? this.env.SMTP_PORT ?? 587);
    // 465 ist implizit TLS, 587 nutzt STARTTLS.
    const secure = this.env.SMTP_SECURE ?? port === 465;
    return { host, port, secure, user, pass };
  }

  isConfigured(): boolean {
    return this.config() !== null;
  }

  missingConfigHint(): string | null {
    if (this.isConfigured()) return null;
    const fehlt = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].filter(
      (k) => !(this.credentials.get(k) ?? (this.env as unknown as Record<string, string>)[k]),
    );
    return `SMTP ist unvollständig konfiguriert. Es fehlt: ${fehlt.join(', ')}.`;
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;
    const cfg = this.config();
    if (!cfg) return null;
    const transportOptions: SMTPTransport.Options = {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      requireTLS: !cfg.secure,
      tls: { minVersion: 'TLSv1.2' },
    };
    this.transporter = nodemailer.createTransport(transportOptions);
    return this.transporter;
  }

  async verify(): Promise<Result<{ info: string }>> {
    const t = this.getTransporter();
    if (!t) return err('NOT_CONFIGURED', this.missingConfigHint() ?? 'SMTP nicht konfiguriert.');
    try {
      await t.verify();
      const cfg = this.config();
      return ok({ info: `Verbindung zu ${cfg?.host}:${cfg?.port} steht, Anmeldung akzeptiert.` });
    } catch (e) {
      return fromException(e, 'PROVIDER_ERROR');
    }
  }

  async defaultFrom(): Promise<string | null> {
    return this.config()?.user ?? null;
  }

  async send(message: OutgoingMessage): Promise<Result<SendOutcome>> {
    const t = this.getTransporter();
    if (!t) return err('NOT_CONFIGURED', this.missingConfigHint() ?? 'SMTP nicht konfiguriert.');

    try {
      const info = (await t.sendMail(toNodemailerOptions(message))) as {
        messageId?: string;
        accepted?: Array<string | { address: string }>;
        rejected?: Array<string | { address: string }>;
        response?: string;
      };

      const accepted = (info.accepted ?? []).map(addr);
      const rejected = (info.rejected ?? []).map(addr);

      // Der Server hat die Verbindung angenommen, die Adresse aber abgelehnt.
      if (accepted.length === 0) {
        return err('SEND_FAILED', `Der Mailserver hat keine Empfängeradresse angenommen. Antwort: ${info.response ?? 'keine'}`, {
          detail: { rejected },
          hint: 'Empfängeradresse prüfen; manche Server lehnen unbekannte Adressen sofort ab.',
        });
      }

      return ok({
        messageId: info.messageId ?? null,
        provider: 'smtp',
        accepted,
        rejected,
        response: info.response,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err('SEND_FAILED', `Versand über SMTP fehlgeschlagen: ${message}`, {
        detail: e instanceof Error ? { name: e.name, code: (e as { code?: string }).code } : e,
        hint: 'Zugangsdaten, Port und TLS-Einstellung prüfen. Viele Hoster verlangen ein eigenes App-Passwort.',
      });
    }
  }
}

function addr(a: string | { address: string }): string {
  return typeof a === 'string' ? a : a.address;
}
