import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../core/env";
import { logger } from "../../core/logger";

export type MailMessage = { to: string; subject: string; text: string; html?: string };
export type MailResult = { ok: true; messageId: string; channel: "smtp" | "log" } | { ok: false; error: string };

let transporter: Transporter | null = null;

/** Für Tests: zuletzt "versendete" Nachrichten des Log-Kanals. */
export const sentMailLog: MailMessage[] = [];

function getTransporter(): Transporter | null {
  const e = env();
  if (!e.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export function mailConfigured(): boolean {
  return Boolean(env().SMTP_HOST);
}

/**
 * Versendet eine E-Mail. Ohne SMTP-Konfiguration wird die Nachricht protokolliert
 * (Kanal "log") – so bleiben Abläufe in Entwicklung/Test prüfbar, ohne dass etwas
 * das System verlässt.
 */
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const t = getTransporter();
  if (!t) {
    sentMailLog.push(msg);
    if (sentMailLog.length > 200) sentMailLog.shift();
    logger.info({ to: msg.to, subject: msg.subject }, "E-Mail (kein SMTP konfiguriert, nur protokolliert)");
    return { ok: true, messageId: `log-${Date.now()}`, channel: "log" };
  }
  try {
    const info = await t.sendMail({ from: env().MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return { ok: true, messageId: info.messageId, channel: "smtp" };
  } catch (err) {
    logger.error({ err, to: msg.to }, "E-Mail-Versand fehlgeschlagen");
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
