'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { toPublicError, ValidationError } from '@/lib/errors';
import { nachrichtSenden } from '@/lib/email/versand';
import { notifyUsers } from '@/lib/notify';

export interface Ergebnis { fehler?: string; hinweis?: string; erfolg?: boolean }

/**
 * Nachricht an das Team eines Events oder an einzelne Mitarbeiter (Spec 29).
 * Mitarbeiter mit Zugang bekommen zusaetzlich eine Benachrichtigung im Planer.
 */
export async function nachrichtSendenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  try {
    const user = await seite('communication.send');
    const betreff = String(formData.get('betreff') ?? '').trim();
    const text = String(formData.get('text') ?? '').trim();
    if (betreff.length < 3) throw new ValidationError('Bitte geben Sie einen Betreff an.');
    if (text.length < 3) throw new ValidationError('Bitte schreiben Sie eine Nachricht.');

    const eventId = String(formData.get('eventId') ?? '') || null;
    const employeeIds = formData.getAll('employeeIds').map(String).filter(Boolean);

    const empfaenger = await db.employee.findMany({
      where: eventId && employeeIds.length === 0
        ? { deletedAt: null, assignments: { some: { eventId, deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] } } } }
        : { deletedAt: null, id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true, email: true, user: { select: { id: true } } },
    });

    if (empfaenger.length === 0) throw new ValidationError('Es wurden keine Empfaenger gefunden.');

    let gesendet = 0;
    const fehler: string[] = [];
    for (const person of empfaenger) {
      if (person.email) {
        const ergebnis = await nachrichtSenden({
          an: person.email, betreff, text,
          vonUserId: user.id, employeeId: person.id, eventId,
        });
        if (ergebnis.gesendet) gesendet++;
        else if (ergebnis.fehler && !fehler.includes(ergebnis.fehler)) fehler.push(ergebnis.fehler);
      } else {
        await nachrichtSenden({ kanal: 'INTERN', an: `${person.firstName} ${person.lastName}`, betreff, text, vonUserId: user.id, employeeId: person.id, eventId });
      }
      if (person.user?.id) {
        await notifyUsers([person.user.id], { kind: 'NACHRICHT', title: betreff, body: text.slice(0, 200), link: '/meine-einsaetze' });
      }
    }

    await audit(user, {
      action: 'message.send', entity: 'Message',
      summary: `Nachricht "${betreff}" an ${empfaenger.length} Empfaenger gesendet`,
    });
    revalidatePath('/kommunikation');

    return fehler.length
      ? { erfolg: true, hinweis: `${gesendet} von ${empfaenger.length} E-Mails versendet. Hinweis: ${fehler.join(' ')}` }
      : { erfolg: true, hinweis: `Nachricht an ${empfaenger.length} Empfaenger uebermittelt.` };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
}
