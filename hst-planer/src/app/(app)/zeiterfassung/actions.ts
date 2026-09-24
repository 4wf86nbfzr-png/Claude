'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { toPublicError } from '@/lib/errors';
import { zeitEntfernen, zeitSpeichern, zeitStatus, zeitenFreigeben } from '@/lib/domain/timesheets';
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

export async function zeitSpeichernAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('timesheets.edit');
    await zeitSpeichern(user, String(formData.get('id') ?? '') || null, formData);
    revalidatePath('/zeiterfassung');
    return { erfolg: true, hinweis: 'Zeit gespeichert.' };
  });
}

export async function zeitStatusAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('timesheets.approve');
    await zeitStatus(user, String(formData.get('id')), String(formData.get('status')) as $Enums.TimeEntryStatus);
    revalidatePath('/zeiterfassung');
    return { erfolg: true, hinweis: 'Status gesetzt.' };
  });
}

export async function zeitenFreigebenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('timesheets.approve');
    const ids = formData.getAll('auswahl').map(String).filter(Boolean);
    const anzahl = await zeitenFreigeben(user, ids);
    revalidatePath('/zeiterfassung');
    return { erfolg: true, hinweis: anzahl === 0 ? 'Es war nichts ausgewaehlt.' : `${anzahl} Eintraege freigegeben.` };
  });
}

export async function zeitEntfernenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('timesheets.edit');
    await zeitEntfernen(user, String(formData.get('id')), String(formData.get('grund') ?? '').trim() || 'ohne Angabe');
    revalidatePath('/zeiterfassung');
    return { erfolg: true, hinweis: 'Eintrag entfernt.' };
  });
}
