'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { toPublicError } from '@/lib/errors';
import { ansprechpartnerSpeichern, kundeDeaktivieren, kundeSpeichern, partnerSpeichern } from '@/lib/domain/partners';

export interface Ergebnis { fehler?: string; hinweis?: string; erfolg?: boolean }

async function fuehreAus(arbeit: () => Promise<Ergebnis | void>): Promise<Ergebnis> {
  try {
    return (await arbeit()) ?? { erfolg: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
}

export async function kundeSpeichernAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const id = String(formData.get('id') ?? '') || null;
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('customers.edit');
    const kunde = await kundeSpeichern(user, id, formData);
    revalidatePath('/kunden');
    return { erfolg: true, hinweis: kunde.id };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/kunden/${ergebnis.hinweis}`);
}

export async function ansprechpartnerAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('customers.edit');
    const customerId = String(formData.get('customerId'));
    await ansprechpartnerSpeichern(user, customerId, formData);
    revalidatePath(`/kunden/${customerId}`);
    return { erfolg: true, hinweis: 'Ansprechpartner gespeichert.' };
  });
}

export async function kundeDeaktivierenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('customers.edit');
    const id = String(formData.get('id'));
    await kundeDeaktivieren(user, id);
    revalidatePath(`/kunden/${id}`);
    return { erfolg: true, hinweis: 'Kunde deaktiviert.' };
  });
}

export async function partnerSpeichernAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const id = String(formData.get('id') ?? '') || null;
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('partners.edit');
    const partner = await partnerSpeichern(user, id, formData);
    revalidatePath('/partner');
    return { erfolg: true, hinweis: partner.id };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/partner/${ergebnis.hinweis}`);
}
