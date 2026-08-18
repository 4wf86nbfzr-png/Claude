import nodemailer, { type Transporter } from 'nodemailer';
import type { MailTransport, OutgoingMessage, SendResult } from './types';

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string | null;
}

/** Versand über SMTP – funktioniert mit jedem Postfach, auch beim Provider im Haus. */
export class SmtpTransport implements MailTransport {
  readonly id = 'smtp';
  readonly label = 'SMTP';
  private transporter: Transporter | null = null;

  constructor(private readonly options: SmtpOptions) {}

  configured(): boolean {
    return Boolean(this.options.host && this.options.user && this.options.password);
  }

  missingHint(): string {
    const fehlt: string[] = [];
    if (!this.options.host) fehlt.push('SMTP_HOST');
    if (!this.options.user) fehlt.push('SMTP_USER');
    if (!this.options.password) fehlt.push('SMTP_PASSWORD');
    return fehlt.length ? `Es fehlt: ${fehlt.join(', ')}.` : 'SMTP ist eingerichtet.';
  }

  private get client(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.options.host,
        port: this.options.port,
        secure: this.options.secure,
        auth: { user: this.options.user, pass: this.options.password ?? '' },
        // STARTTLS erzwingen, wenn nicht ohnehin implizit verschlüsselt wird.
        requireTLS: !this.options.secure
      });
    }
    return this.transporter;
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.configured()) return { ok: false, error: this.missingHint() };
    try {
      await this.client.verify();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    if (!this.configured()) return { ok: false, error: `SMTP ist nicht eingerichtet. ${this.missingHint()}` };
    try {
      const info = await this.client.sendMail({
        from: { name: message.from.name, address: message.from.address },
        to: message.to,
        cc: message.cc.length ? message.cc : undefined,
        bcc: message.bcc.length ? message.bcc : undefined,
        replyTo: message.replyTo ?? undefined,
        subject: message.subject,
        text: message.text,
        html: message.html ?? undefined,
        inReplyTo: message.inReplyTo ?? undefined,
        references: message.references?.length ? message.references : undefined,
        attachments: message.attachments.map((anhang) => ({
          filename: anhang.filename,
          path: anhang.path,
          contentType: anhang.contentType
        }))
      });
      const rejected = (info.rejected ?? []).map(String);
      if (rejected.length > 0 && (info.accepted ?? []).length === 0) {
        return { ok: false, error: `Server hat alle Empfänger abgelehnt: ${rejected.join(', ')}`, rejected };
      }
      return {
        ok: true,
        messageId: info.messageId,
        ...(rejected.length ? { rejected } : {})
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
