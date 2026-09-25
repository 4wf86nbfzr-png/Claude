'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/auth/session';
import { zuruecksetzenAnfordern } from '@/lib/auth/zuruecksetzen';

export interface Zustand { fehler?: string; erledigt?: boolean }

const SCHEMA = z.object({
  email: z.string().trim().toLowerCase().email('Bitte geben Sie eine gültige E-Mail-Adresse an.'),
});

/**
 * Zurücksetzen anfordern.
 *
 * Die Antwort ist immer dieselbe – ob die Adresse bekannt ist oder nicht.
 * Sonst wäre dieses Formular eine Auskunft darüber, wer hier ein Konto hat.
 */
export async function zuruecksetzenAktion(_zustand: Zustand, formData: FormData): Promise<Zustand> {
  const eingabe = SCHEMA.safeParse({ email: formData.get('email') });
  if (!eingabe.success) {
    return { fehler: eingabe.error.issues[0]?.message ?? 'Bitte prüfen Sie Ihre Eingabe.' };
  }

  const ip = (await clientIp()) ?? 'unbekannt';
  if (!rateLimit(`reset:ip:${ip}`, 5, 900).ok || !rateLimit(`reset:konto:${eingabe.data.email}`, 3, 900).ok) {
    // Auch hier keine andere Auskunft als sonst – nur der Hinweis auf die Bremse.
    return { fehler: 'Zu viele Anfragen. Bitte warten Sie einige Minuten.' };
  }

  const kopf = await headers();
  const herkunft = kopf.get('origin')
    ?? `${kopf.get('x-forwarded-proto') ?? 'http'}://${kopf.get('host') ?? 'localhost:3000'}`;

  try {
    await zuruecksetzenAnfordern(eingabe.data.email, herkunft, ip);
  } catch {
    // Auch ein gescheiterter Versand ändert die Antwort nicht. Was
    // schiefging, steht in der Serverkonsole und im Protokoll.
  }

  return { erledigt: true };
}
