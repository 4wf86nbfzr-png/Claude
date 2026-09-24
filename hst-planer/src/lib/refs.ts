import 'server-only';
import { db } from './db';

/**
 * Fortlaufende, menschenlesbare Nummern: EV-2026-0042, AN-2026-0007, AB-2026-0003.
 * Der Zaehler laeuft in einer eigenen Tabelle und wird atomar hochgezaehlt,
 * damit zwei gleichzeitige Anlagen nicht dieselbe Nummer bekommen.
 */
export type RefKind = 'EV' | 'AN' | 'AB' | 'MA';

export async function nextReference(kind: RefKind, year = new Date().getUTCFullYear()): Promise<string> {
  const key = `${kind}-${year}`;
  const counter = await db.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${kind}-${year}-${String(counter.value).padStart(4, '0')}`;
}

/** Personalnummern laufen ohne Jahr: HST-0001. */
export async function nextPersonnelNo(): Promise<string> {
  const counter = await db.counter.upsert({
    where: { key: 'PERSONALNUMMER' },
    create: { key: 'PERSONALNUMMER', value: 1 },
    update: { value: { increment: 1 } },
  });
  return `HST-${String(counter.value).padStart(4, '0')}`;
}
