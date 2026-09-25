'use server';

import { redirect } from 'next/navigation';
import { clientIp } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { passwortNeuSetzen } from '@/lib/auth/zuruecksetzen';
import { toPublicError } from '@/lib/errors';

export interface Zustand { fehler?: string }

export async function passwortNeuAktion(_zustand: Zustand, formData: FormData): Promise<Zustand> {
  const token = String(formData.get('token') ?? '');
  const neu = String(formData.get('neu') ?? '');
  const wiederholung = String(formData.get('wiederholung') ?? '');

  const ip = (await clientIp()) ?? 'unbekannt';
  if (!rateLimit(`reset-einloesen:${ip}`, 10, 900).ok) {
    return { fehler: 'Zu viele Versuche. Bitte warten Sie einige Minuten.' };
  }

  if (neu !== wiederholung) return { fehler: 'Die beiden Passwörter stimmen nicht überein.' };

  try {
    await passwortNeuSetzen(token, neu, ip);
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }

  redirect('/anmelden?neu=1');
}
