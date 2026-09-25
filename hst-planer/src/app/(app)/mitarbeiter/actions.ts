'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { toPublicError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { mitarbeiterAendern, mitarbeiterAnlegen, mitarbeiterDeaktivieren, zugangAnlegen } from '@/lib/domain/employees';
import { toDateOnly } from '@/lib/time';
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

export async function mitarbeiterSpeichern(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const id = String(formData.get('id') ?? '');
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('employees.edit');
    if (id) {
      await mitarbeiterAendern(user, id, formData);
      revalidatePath(`/mitarbeiter/${id}`);
      return { erfolg: true, hinweis: id };
    }
    const employee = await mitarbeiterAnlegen(user, formData);
    revalidatePath('/mitarbeiter');
    return { erfolg: true, hinweis: employee.id };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/mitarbeiter/${ergebnis.hinweis}`);
}

export async function mitarbeiterDeaktivierenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('employees.edit');
    const id = String(formData.get('id'));
    await mitarbeiterDeaktivieren(user, id, String(formData.get('grund') ?? '').trim() || 'ohne Angabe');
    revalidatePath(`/mitarbeiter/${id}`);
    return { erfolg: true, hinweis: 'Der Mitarbeiter wurde deaktiviert.' };
  });
}

export async function zugangAnlegenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.users');
    const id = String(formData.get('id'));
    await zugangAnlegen(user, id, String(formData.get('email')), String(formData.get('passwort')));
    revalidatePath(`/mitarbeiter/${id}`);
    return { erfolg: true, hinweis: 'Zugang angelegt. Der Mitarbeiter muss das Passwort bei der ersten Anmeldung ändern.' };
  });
}

/** Verfügbarkeit erfassen – von der Disposition oder vom Mitarbeiter selbst (Spec 35). */
export async function verfuegbarkeitAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('self.availability');
    const employeeId = String(formData.get('employeeId'));
    if (user.role === 'MITARBEITER' && user.employeeId !== employeeId) {
      throw new ValidationError('Sie können nur Ihre eigene Verfügbarkeit pflegen.');
    }
    const von = String(formData.get('von'));
    const bis = String(formData.get('bis') || von);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis)) {
      throw new ValidationError('Bitte geben Sie einen gültigen Zeitraum an.');
    }
    if (bis < von) throw new ValidationError('Das Ende darf nicht vor dem Beginn liegen.');

    const eintrag = await db.availability.create({
      data: {
        employeeId,
        kind: String(formData.get('art')) as $Enums.AvailabilityKind,
        from: toDateOnly(`${von}T00:00:00Z`),
        to: toDateOnly(`${bis}T00:00:00Z`),
        note: String(formData.get('notiz') ?? '').trim() || null,
      },
    });
    await audit(user, {
      action: 'availability.create', entity: 'Availability', entityId: eintrag.id,
      summary: `Verfügbarkeit ${eintrag.kind} vom ${von} bis ${bis} erfasst`,
    });
    revalidatePath(`/mitarbeiter/${employeeId}`);
    revalidatePath('/meine-verfuegbarkeit');
    return { erfolg: true, hinweis: 'Eintrag gespeichert.' };
  });
}

export async function verfuegbarkeitLoeschenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('self.availability');
    const id = String(formData.get('id'));
    const eintrag = await db.availability.findUnique({ where: { id } });
    if (!eintrag) return { fehler: 'Der Eintrag wurde nicht gefunden.' };
    if (user.role === 'MITARBEITER' && user.employeeId !== eintrag.employeeId) {
      throw new ValidationError('Sie können nur eigene Einträge entfernen.');
    }
    await db.availability.delete({ where: { id } });
    await audit(user, { action: 'availability.delete', entity: 'Availability', entityId: id, summary: 'Verfügbarkeitseintrag entfernt' });
    revalidatePath(`/mitarbeiter/${eintrag.employeeId}`);
    revalidatePath('/meine-verfuegbarkeit');
    return { erfolg: true, hinweis: 'Eintrag entfernt.' };
  });
}
