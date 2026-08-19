import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type { OutgoingMessage } from './types.js';
import { textToHtml } from '../util/text.js';

/**
 * Baut eine vollstaendige MIME-Nachricht.
 *
 * Gmail und Microsoft Graph nehmen fertige MIME-Daten entgegen; damit sieht
 * eine Mail ueber alle drei Wege identisch aus und wir haben nur eine Stelle,
 * an der Kopfzeilen entstehen.
 */
export function toNodemailerOptions(message: OutgoingMessage): Record<string, unknown> {
  const options: Record<string, unknown> = {
    from: message.from.name ? { name: message.from.name, address: message.from.address } : message.from.address,
    to: message.to.map((t) => (t.name ? { name: t.name, address: t.address } : t.address)),
    subject: message.subject,
    text: message.text,
    html: message.html ?? textToHtml(message.text),
  };
  if (message.cc?.length) options.cc = message.cc;
  if (message.bcc?.length) options.bcc = message.bcc;
  if (message.replyTo) options.replyTo = message.replyTo;
  if (message.inReplyTo) options.inReplyTo = message.inReplyTo;
  if (message.references?.length) options.references = message.references;
  if (message.attachments?.length) {
    options.attachments = message.attachments.map((a) => ({
      filename: a.filename,
      path: a.path,
      ...(a.contentType ? { contentType: a.contentType } : {}),
    }));
  }
  if (message.headers) options.headers = message.headers;
  return options;
}

export async function buildMime(message: OutgoingMessage): Promise<Buffer> {
  const composer = new MailComposer(toNodemailerOptions(message));
  return await composer.compile().build();
}

/** base64url ohne Polsterung -- so will es die Gmail-API. */
export function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
