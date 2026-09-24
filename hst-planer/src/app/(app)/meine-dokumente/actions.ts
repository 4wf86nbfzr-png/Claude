'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { toPublicError, ValidationError } from '@/lib/errors';
import { dokumentAnlegen } from '@/lib/domain/documents';
import { notifyDispo } from '@/lib/notify';
import { nachrichtSenden } from '@/lib/email/versand';
import type { $Enums } from '@prisma/client';

export interface Ergebnis { fehler?: string; hinweis?: string; erfolg?: boolean }

async function fuehreAus(arbeit: () => Promise<Ergebnis | void>): Promise<Ergebnis> {
  try {
    return (await arbeit()) ?? { erfolg: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
}

/**
 * Mitarbeiter laden eigene Nachweise selbst hoch (Spec 12).
 *
 * Bewusst eingeschraenkt: Das Dokument landet immer am eigenen Profil, ist
 * für den Mitarbeiter sichtbar, und die Disposition wird benachrichtigt –
 * ein hochgeladener Nachweis nützt nur, wenn ihn jemand prüft.
 */
export async function eigenesDokumentAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('self.documents');
    if (!user.employeeId) throw new ValidationError('Ihr Zugang ist keinem Mitarbeiterprofil zugeordnet.');

    const datei = formData.get('datei');
    if (!(datei instanceof File) || datei.size === 0) throw new ValidationError('Bitte wählen Sie eine Datei aus.');

    const erlaubteTypen: $Enums.DocumentType[] = ['FUEHRUNGSZEUGNIS', 'AUSWEIS', 'SCHULUNGSNACHWEIS', 'SONSTIGES'];
    const gewaehlt = String(formData.get('typ') ?? 'SONSTIGES') as $Enums.DocumentType;
    const typ = erlaubteTypen.includes(gewaehlt) ? gewaehlt : 'SONSTIGES';

    const dokument = await dokumentAnlegen(user, {
      datei, typ,
      titel: String(formData.get('titel') ?? ''),
      gueltigBis: String(formData.get('gueltigBis') ?? '') || null,
      fuerMitarbeiterSichtbar: true,
      employeeId: user.employeeId,
    });

    await notifyDispo({
      kind: 'SYSTEM',
      title: `Neues Dokument von ${user.name}`,
      body: `${dokument.title} (${typ.toLowerCase()}) wurde hochgeladen und wartet auf Prüfung.`,
      link: `/mitarbeiter/${user.employeeId}`,
      dedupeKey: `dokument:${dokument.id}`,
    });

    revalidatePath('/meine-dokumente');
    return { erfolg: true, hinweis: 'Dokument hochgeladen. Die Disposition wurde informiert.' };
  });
}

/** Nachricht an die Disposition (Spec 12). */
export async function nachrichtAnDispoAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('self.shifts');
    const betreff = String(formData.get('betreff') ?? '').trim();
    const text = String(formData.get('text') ?? '').trim();
    if (betreff.length < 3) throw new ValidationError('Bitte geben Sie einen kurzen Betreff an.');
    if (text.length < 3) throw new ValidationError('Bitte schreiben Sie Ihre Nachricht.');

    const eventId = String(formData.get('eventId') ?? '') || null;
    const empfaenger = process.env.DISPO_NOTIFY_EMAIL || process.env.SMTP_FROM || '';

    await nachrichtSenden({
      kanal: empfaenger ? 'EMAIL' : 'INTERN',
      an: empfaenger || 'Disposition',
      betreff: `[Mitarbeiter] ${betreff}`,
      text: `${text}\n\n---\nVon: ${user.name} (${user.email})`,
      vonUserId: user.id,
      employeeId: user.employeeId,
      eventId,
    });

    await notifyDispo({
      kind: 'NACHRICHT',
      title: `Nachricht von ${user.name}`,
      body: `${betreff}: ${text.slice(0, 200)}`,
      link: user.employeeId ? `/mitarbeiter/${user.employeeId}` : '/kommunikation',
    });
    await audit(user, {
      action: 'message.to_dispo', entity: 'Message',
      summary: `${user.name} hat der Disposition geschrieben: ${betreff}`,
    });

    revalidatePath('/meine-einsaetze');
    return { erfolg: true, hinweis: 'Ihre Nachricht ist bei der Disposition angekommen.' };
  });
}
