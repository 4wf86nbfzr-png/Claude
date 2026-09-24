import 'server-only';
import { db } from '../db';
import { AppError } from '../errors';

/**
 * E-Mail-Versand (Spec 29).
 *
 * Jede ausgehende Nachricht wird in `Message` protokolliert – auch wenn der
 * Versand scheitert. So bleibt nachvollziehbar, was ein Mitarbeiter
 * tatsaechlich bekommen hat.
 *
 * WhatsApp, SMS und Push sind in `MessageChannel` bereits vorgesehen; sie
 * brauchen nur einen weiteren Zweig in `nachrichtSenden`.
 */
export function versandKonfiguriert(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export interface EmailEingabe {
  an: string;
  betreff: string;
  text: string;
  antwortAn?: string;
}

export async function emailSenden(eingabe: EmailEingabe): Promise<void> {
  if (!versandKonfiguriert()) {
    throw new AppError('Der E-Mail-Versand ist noch nicht eingerichtet. Bitte SMTP-Zugangsdaten in der .env hinterlegen.', { status: 503, code: 'VERSAND_NICHT_KONFIGURIERT' });
  }

  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: eingabe.an,
    subject: eingabe.betreff,
    text: eingabe.text,
    replyTo: eingabe.antwortAn,
  });
}

export interface NachrichtEingabe {
  kanal?: 'EMAIL' | 'INTERN';
  an: string;
  betreff: string;
  text: string;
  vonUserId?: string;
  employeeId?: string | null;
  eventId?: string | null;
}

/** Sendet und protokolliert. Ein Fehlschlag wird als Fehler vermerkt, nicht verschluckt. */
export async function nachrichtSenden(eingabe: NachrichtEingabe): Promise<{ gesendet: boolean; fehler?: string }> {
  const eintrag = await db.message.create({
    data: {
      channel: eingabe.kanal ?? 'EMAIL',
      direction: 'AUS',
      subject: eingabe.betreff,
      body: eingabe.text,
      toAddress: eingabe.an,
      fromUserId: eingabe.vonUserId ?? null,
      employeeId: eingabe.employeeId ?? null,
      eventId: eingabe.eventId ?? null,
    },
  });

  if ((eingabe.kanal ?? 'EMAIL') === 'INTERN') {
    await db.message.update({ where: { id: eintrag.id }, data: { sentAt: new Date() } });
    return { gesendet: true };
  }

  try {
    await emailSenden({ an: eingabe.an, betreff: eingabe.betreff, text: eingabe.text });
    await db.message.update({ where: { id: eintrag.id }, data: { sentAt: new Date() } });
    return { gesendet: true };
  } catch (fehler) {
    const text = fehler instanceof AppError ? fehler.userMessage : fehler instanceof Error ? fehler.message : String(fehler);
    await db.message.update({ where: { id: eintrag.id }, data: { error: text } });
    console.error('[HST Planer] E-Mail-Versand fehlgeschlagen:', fehler);
    return { gesendet: false, fehler: text };
  }
}
