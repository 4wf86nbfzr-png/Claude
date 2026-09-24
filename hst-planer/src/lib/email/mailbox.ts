import 'server-only';
import { db } from '../db';
import { parseRequestEmail } from './parser';
import { anreichern } from './ai';
import { anfrageAusEmail } from '../domain/requests';

/**
 * Postfach abrufen (Spec 17).
 *
 * Läuft nicht dauerhaft im Webprozess, sondern wird angestossen:
 *   * `npm run mail:poll` (z. B. aus einem Cron alle 5 Minuten)
 *   * POST /api/jobs/postfach  (mit API-Schlüssel, für externe Scheduler)
 *
 * Jede Mail wird zuerst roh gespeichert und erst danach ausgewertet. Fällt
 * der Parser aus, ist die Nachricht trotzdem im System und kann von Hand
 * bearbeitet werden.
 */

export interface AbrufErgebnis {
  geprueft: number;
  neu: number;
  anfragen: number;
  uebersprungen: number;
  fehler: string[];
}

export function postfachKonfiguriert(): boolean {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
}

export async function postfachAbrufen(limit = 50): Promise<AbrufErgebnis> {
  const ergebnis: AbrufErgebnis = { geprueft: 0, neu: 0, anfragen: 0, uebersprungen: 0, fehler: [] };
  if (!postfachKonfiguriert()) {
    ergebnis.fehler.push('Es ist kein Postfach konfiguriert (EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD).');
    return ergebnis;
  }

  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');

  const client = new ImapFlow({
    host: process.env.EMAIL_HOST!,
    port: Number(process.env.EMAIL_PORT ?? 993),
    secure: process.env.EMAIL_SECURE !== 'false',
    auth: { user: process.env.EMAIL_USER!, pass: process.env.EMAIL_PASSWORD! },
    logger: false,
  });

  await client.connect();
  const postfach = process.env.EMAIL_MAILBOX || 'INBOX';
  const schloss = await client.getMailboxLock(postfach);

  try {
    const ungelesen = await client.search({ seen: false });
    const auswahl = (ungelesen || []).slice(-limit);

    for (const uid of auswahl) {
      ergebnis.geprueft++;
      try {
        const nachricht = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!nachricht || !nachricht.source) { ergebnis.uebersprungen++; continue; }

        const mail = await simpleParser(nachricht.source);
        const messageId = mail.messageId ?? `uid-${uid}@${postfach}`;

        if (await db.emailMessage.findUnique({ where: { messageId } })) {
          ergebnis.uebersprungen++;
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          continue;
        }

        const absender = mail.from?.value?.[0];
        const gespeichert = await db.emailMessage.create({
          data: {
            messageId,
            fromName: absender?.name || null,
            fromEmail: absender?.address ?? 'unbekannt@unbekannt',
            toEmail: process.env.EMAIL_USER ?? null,
            subject: mail.subject ?? null,
            receivedAt: mail.date ?? new Date(),
            textBody: mail.text ?? null,
            htmlBody: typeof mail.html === 'string' ? mail.html : null,
            status: 'NEU',
          },
        });
        ergebnis.neu++;

        // Auswerten – zuerst regelbasiert, danach optional mit KI ergänzen.
        let geparst = parseRequestEmail({
          subject: gespeichert.subject,
          body: gespeichert.textBody ?? '',
          fromName: gespeichert.fromName,
          fromEmail: gespeichert.fromEmail,
        });

        if (geparst.isRequest || geparst.confidence >= 0.3) {
          geparst = await anreichern(geparst, {
            subject: gespeichert.subject,
            body: gespeichert.textBody ?? '',
            fromEmail: gespeichert.fromEmail,
          });
          await anfrageAusEmail(gespeichert.id, geparst);
          ergebnis.anfragen++;
        } else {
          await db.emailMessage.update({ where: { id: gespeichert.id }, data: { status: 'IGNORIERT' } });
        }

        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        const ziel = process.env.EMAIL_PROCESSED_MAILBOX;
        if (ziel) await client.messageMove(String(uid), ziel, { uid: true });
      } catch (fehler) {
        const text = fehler instanceof Error ? fehler.message : String(fehler);
        ergebnis.fehler.push(`UID ${uid}: ${text}`);
        console.error('[HST Planer] E-Mail konnte nicht verarbeitet werden:', fehler);
      }
    }
  } finally {
    schloss.release();
    await client.logout().catch(() => {});
  }

  return ergebnis;
}
