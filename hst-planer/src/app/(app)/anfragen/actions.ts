'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { clientIp } from '@/lib/auth/session';
import { toPublicError } from '@/lib/errors';
import { anfrageAusFormular, anfrageStatus, anfrageUebernehmen, OEFFENTLICHE_ANFRAGE } from '@/lib/domain/requests';
import { parseWith } from '@/lib/api';
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

export async function anfrageErfassenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const ergebnis = await fuehreAus(async () => {
    await seite('requests.edit');
    const eingabe = parseWith(OEFFENTLICHE_ANFRAGE, Object.fromEntries(formData.entries()));
    const anfrage = await anfrageAusFormular(eingabe, { kanal: 'MANUELL', ip: await clientIp() });
    revalidatePath('/anfragen');
    return { erfolg: true, hinweis: anfrage.id };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/anfragen/${ergebnis.hinweis}`);
}

export async function anfrageUebernehmenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('requests.edit');
    const event = await anfrageUebernehmen(user, String(formData.get('id')), formData);
    revalidatePath('/anfragen');
    return { erfolg: true, hinweis: event.id };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/events/${ergebnis.hinweis}`);
}

export async function anfrageStatusAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('requests.edit');
    const id = String(formData.get('id'));
    await anfrageStatus(user, id, String(formData.get('status')) as $Enums.RequestStatus, String(formData.get('notiz') ?? '').trim() || undefined);
    revalidatePath(`/anfragen/${id}`);
    revalidatePath('/anfragen');
    return { erfolg: true, hinweis: 'Status aktualisiert.' };
  });
}
