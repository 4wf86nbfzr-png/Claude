import 'server-only';
import { db } from '../db';

/**
 * Besetzungsgrad eines Events.
 *
 * Gezaehlt werden nur Zuweisungen, die wirklich tragen: Ersatzkraefte und
 * abgesagte Zuweisungen fuellen keine Position. Das ist die Zahl, auf die
 * ein Disponent seine Entscheidung stuetzt – deshalb steht sie an genau
 * einer Stelle im Code.
 */
export const BESETZENDE_STATUS = ['EINGETEILT', 'ZUGESAGT', 'ANGEFRAGT', 'ERSCHIENEN'] as const;
export const BESTAETIGTE_STATUS = ['ZUGESAGT', 'ERSCHIENEN'] as const;

export interface Besetzung { soll: number; ist: number; bestaetigt: number; offen: number }

export function besetzungAus(
  positions: Array<{ requiredCount: number; assignments: Array<{ status: string; isReserve: boolean }> }>,
): Besetzung {
  let soll = 0, ist = 0, bestaetigt = 0;
  for (const position of positions) {
    soll += position.requiredCount;
    const aktiv = position.assignments.filter((a) => !a.isReserve && (BESETZENDE_STATUS as readonly string[]).includes(a.status));
    // Ueberbuchungen zaehlen nicht als zusaetzliche Besetzung.
    ist += Math.min(position.requiredCount, aktiv.length);
    bestaetigt += Math.min(
      position.requiredCount,
      aktiv.filter((a) => (BESTAETIGTE_STATUS as readonly string[]).includes(a.status)).length,
    );
  }
  return { soll, ist, bestaetigt, offen: Math.max(0, soll - ist) };
}

export const EVENT_MIT_BESETZUNG = {
  positions: {
    select: { id: true, requiredCount: true, assignments: { where: { deletedAt: null }, select: { status: true, isReserve: true } } },
  },
} as const;

/**
 * Setzt den Eventstatus anhand der Besetzung nach (Spec 9).
 * Bereits bestaetigte, laufende oder abgeschlossene Events bleiben unberuehrt –
 * dort entscheidet die Disposition, nicht die Automatik.
 */
export async function statusNachziehen(eventId: string): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, ...EVENT_MIT_BESETZUNG },
  });
  if (!event) return;
  if (!['PLANUNG', 'TEILBESETZT', 'BESETZT'].includes(event.status)) return;

  const { soll, ist } = besetzungAus(event.positions);
  const neu = soll === 0 ? 'PLANUNG' : ist >= soll ? 'BESETZT' : ist > 0 ? 'TEILBESETZT' : 'PLANUNG';
  if (neu !== event.status) {
    await db.event.update({ where: { id: eventId }, data: { status: neu } });
  }
}
