import 'server-only';
import { db } from '../db';
import { can } from '../auth/rbac';
import { ForbiddenError } from '../errors';
import { clientIp } from '../auth/session';
import type { SessionUser } from '../auth/session';

/**
 * Exportprotokoll (SecPlan 21).
 *
 * Ein Export ist der Punkt, an dem personenbezogene Daten das System
 * verlassen. Danach gilt kein Rollenkonzept mehr – die Tabelle liegt im
 * Downloadordner. Deshalb zwei Dinge:
 *
 *   1. Ein Export braucht ein eigenes Recht (`export.run`), nicht nur
 *      das Leserecht auf den Bereich. Sehen und mitnehmen ist nicht
 *      dasselbe.
 *   2. Jeder Export wird festgehalten: wer, wann, was, wie viele Zeilen,
 *      mit welchem Filter. Ohne diesen Eintrag lässt sich später nicht
 *      sagen, wo eine Liste herkam.
 */

export interface ExportAngabe {
  /** Kurzname des Bereichs, z. B. "mitarbeiter". */
  bereich: string;
  format: 'CSV' | 'XLSX' | 'PDF' | 'JSON';
  rowCount: number;
  /** Die angewandte Einschränkung, in Worten. */
  filter?: string | null;
  /** Zweck, falls angegeben. */
  purpose?: string | null;
}

/**
 * Prüft das Exportrecht und hält den Vorgang fest.
 * Wirft, wenn die Rolle nicht exportieren darf – der abgewiesene Versuch
 * steht dann trotzdem im Protokoll.
 */
export async function protokolliereExport(user: SessionUser, angabe: ExportAngabe): Promise<void> {
  const erlaubt = can(user.role, 'export.run');
  const ip = await clientIp();

  await db.exportLog.create({
    data: {
      userId: user.id,
      role: user.role,
      bereich: erlaubt ? angabe.bereich : `${angabe.bereich} (abgewiesen)`,
      format: angabe.format,
      rowCount: erlaubt ? angabe.rowCount : 0,
      filter: angabe.filter ?? null,
      purpose: angabe.purpose ?? null,
      ip: ip ?? null,
    },
  });

  if (!erlaubt) {
    throw new ForbiddenError(
      'Ihre Rolle darf Daten ansehen, aber nicht exportieren. '
      + 'Ein Export nimmt die Daten aus dem Rechtekonzept heraus und ist deshalb gesondert freigegeben.',
    );
  }
}

/** Filterangaben aus einer Adresse lesbar zusammenfassen. */
export function filterAusUrl(url: string): string | null {
  const params = new URL(url).searchParams;
  const teile: string[] = [];
  for (const [schluessel, wert] of params) {
    if (schluessel === 'format' || !wert) continue;
    teile.push(`${schluessel}=${wert}`);
  }
  return teile.length > 0 ? teile.join(', ') : null;
}
