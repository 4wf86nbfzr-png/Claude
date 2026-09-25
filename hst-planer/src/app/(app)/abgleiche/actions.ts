'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { toPublicError, ValidationError } from '@/lib/errors';
import {
  abgleichAbschliessen, abgleichStarten, dateiHochladen,
  unkritischeBestaetigen, zeileIgnorieren, zeileKorrigieren,
} from '@/lib/domain/reconciliation';
import { TIMESHEET_FIELDS, type ColumnMapping, type TimesheetField } from '@/lib/import/columns';
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

export async function dateiHochladenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('reconciliation.edit');
    const datei = formData.get('datei');
    if (!(datei instanceof File) || datei.size === 0) throw new ValidationError('Bitte wählen Sie eine Datei aus.');
    const vorschau = await dateiHochladen(user, datei, String(formData.get('name') ?? ''));
    revalidatePath('/abgleiche');
    return { erfolg: true, hinweis: vorschau.reconciliationId };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/abgleiche/${ergebnis.hinweis}/zuordnen`);
}

/** Spaltenzuordnung aus dem Formular lesen: Feld -> gewählte Spalte. */
function mappingAus(formData: FormData): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const definition of TIMESHEET_FIELDS) {
    const wert = String(formData.get(`spalte_${definition.field}`) ?? '').trim();
    if (wert) mapping[definition.field as TimesheetField] = wert;
  }
  return mapping;
}

export async function abgleichStartenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const id = String(formData.get('id'));
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('reconciliation.edit');
    const zusammenfassung = await abgleichStarten(user, id, {
      mapping: mappingAus(formData),
      toleranzMinuten: Number(formData.get('toleranz') ?? 15),
      pausenToleranzMinuten: Number(formData.get('pausenToleranz') ?? 15),
      fehlendeMelden: formData.get('fehlendeMelden') === 'on',
      vorlageSpeichernAls: String(formData.get('vorlageName') ?? ''),
    });
    revalidatePath(`/abgleiche/${id}`);
    return {
      erfolg: true,
      hinweis: `${zusammenfassung.totalRows} Datensätze verarbeitet · ${zusammenfassung.matchedRows} automatisch zugeordnet · ${zusammenfassung.deviationRows} Abweichungen · ${zusammenfassung.unknownRows} unbekannte Mitarbeiter · ${zusammenfassung.duplicateRows} doppelte Einträge`,
    };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/abgleiche/${id}`);
}

export async function zeileKorrigierenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('reconciliation.edit');
    const id = String(formData.get('reconciliationId'));
    const pause = String(formData.get('actualBreak') ?? '');
    await zeileKorrigieren(user, String(formData.get('rowId')), {
      employeeId: formData.get('employeeId') !== null ? String(formData.get('employeeId')) || null : undefined,
      assignmentId: formData.get('assignmentId') !== null ? String(formData.get('assignmentId')) || null : undefined,
      actualStart: formData.get('actualStart') !== null ? String(formData.get('actualStart')) || null : undefined,
      actualEnd: formData.get('actualEnd') !== null ? String(formData.get('actualEnd')) || null : undefined,
      actualBreak: pause === '' ? undefined : Number(pause),
      comment: formData.get('comment') !== null ? String(formData.get('comment')) || null : undefined,
      status: (String(formData.get('status') ?? '') || undefined) as $Enums.RowStatus | undefined,
    });
    revalidatePath(`/abgleiche/${id}`);
    return { erfolg: true, hinweis: 'Zeile gespeichert.' };
  });
}

export async function zeileIgnorierenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('reconciliation.edit');
    const id = String(formData.get('reconciliationId'));
    await zeileIgnorieren(user, String(formData.get('rowId')), String(formData.get('grund') ?? '').trim() || 'ohne Angabe');
    revalidatePath(`/abgleiche/${id}`);
    return { erfolg: true, hinweis: 'Zeile wird nicht übernommen.' };
  });
}

export async function unkritischeBestaetigenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('reconciliation.edit');
    const id = String(formData.get('id'));
    const anzahl = await unkritischeBestaetigen(user, id, Number(formData.get('grenze') ?? 30));
    revalidatePath(`/abgleiche/${id}`);
    return { erfolg: true, hinweis: anzahl === 0 ? 'Es gab keine unkritischen Abweichungen.' : `${anzahl} Abweichungen bestätigt.` };
  });
}

export async function abgleichAbschliessenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('reconciliation.close');
    const id = String(formData.get('id'));
    const ergebnis = await abgleichAbschliessen(user, id);
    revalidatePath(`/abgleiche/${id}`);
    revalidatePath('/zeiterfassung');
    return { erfolg: true, hinweis: `Abgleich abgeschlossen. ${ergebnis.geschrieben} Zeiten wurden in die Zeiterfassung übernommen.` };
  });
}
