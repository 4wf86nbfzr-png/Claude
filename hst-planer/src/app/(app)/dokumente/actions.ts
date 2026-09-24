'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { toPublicError, ValidationError } from '@/lib/errors';
import { dokumentAnlegen, dokumentEntfernen } from '@/lib/domain/documents';
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

export async function dokumentHochladenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('documents.edit');
    const datei = formData.get('datei');
    if (!(datei instanceof File) || datei.size === 0) throw new ValidationError('Bitte wählen Sie eine Datei aus.');

    const dokument = await dokumentAnlegen(user, {
      datei,
      typ: (String(formData.get('typ')) || 'SONSTIGES') as $Enums.DocumentType,
      titel: String(formData.get('titel') ?? ''),
      gueltigBis: String(formData.get('gueltigBis') ?? '') || null,
      fuerMitarbeiterSichtbar: formData.get('sichtbar') === 'on',
      employeeId: String(formData.get('employeeId') ?? '') || null,
      customerId: String(formData.get('customerId') ?? '') || null,
      eventId: String(formData.get('eventId') ?? '') || null,
      partnerId: String(formData.get('partnerId') ?? '') || null,
    });

    revalidatePath('/dokumente');
    if (dokument.employeeId) revalidatePath(`/mitarbeiter/${dokument.employeeId}`);
    if (dokument.eventId) revalidatePath(`/events/${dokument.eventId}/dokumente`);
    return { erfolg: true, hinweis: 'Dokument gespeichert.' };
  });
}

export async function dokumentEntfernenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('documents.edit');
    await dokumentEntfernen(user, String(formData.get('id')));
    revalidatePath('/dokumente');
    return { erfolg: true, hinweis: 'Dokument entfernt.' };
  });
}
