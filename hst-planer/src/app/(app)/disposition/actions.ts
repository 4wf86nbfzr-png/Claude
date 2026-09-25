'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { pruefeZuweisung, zuweisen } from '@/lib/domain/assignments';
import { blockiert, ueberschrift, type Konflikt } from '@/lib/dispo/pruefung';
import { toPublicError } from '@/lib/errors';

export interface ZuordnenErgebnis {
  erfolg?: boolean;
  konflikte?: Konflikt[];
  ueberschrift?: string;
  fehler?: string;
}

/**
 * Zuordnung per Ziehen und Ablegen (SecPlan 4).
 *
 * Zwei Durchgänge: erst nur prüfen, damit die Oberfläche die Gründe zeigen
 * kann, dann – nach ausdrücklicher Bestätigung – speichern. Blockierende
 * Gründe lassen sich auch mit `trotzdem` nicht übergehen; das entscheidet
 * `zuweisen()` im Domänencode, nicht der Browser.
 */
export async function zuordnenAktion(
  positionId: string,
  employeeId: string,
  trotzdem: boolean,
): Promise<ZuordnenErgebnis> {
  try {
    const user = await seite('dispo.assign');

    if (!trotzdem) {
      const konflikte = await pruefeZuweisung(positionId, employeeId);
      if (konflikte.length > 0) {
        return { konflikte, ueberschrift: ueberschrift(konflikte) };
      }
    }

    await zuweisen(user, { positionId, employeeId, trotzdem });
    revalidatePath('/disposition');
    revalidatePath('/dashboard');
    return { erfolg: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    const { body } = toPublicError(error);
    const details = body.details as { konflikte?: Konflikt[] } | Konflikt[] | undefined;
    const konflikte = Array.isArray(details) ? details : details?.konflikte;
    if (konflikte?.length) {
      return { konflikte, ueberschrift: ueberschrift(konflikte), fehler: blockiert(konflikte) ? body.error : undefined };
    }
    return { fehler: body.error };
  }
}
