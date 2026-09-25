'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/session';
import { verschluesseln, verschluesselungBereit } from '@/lib/krypto';
import { toPublicError, ValidationError } from '@/lib/errors';
import type { $Enums } from '@prisma/client';

export interface Ergebnis { fehler?: string; hinweis?: string; erfolg?: boolean }

async function fuehreAus(arbeit: () => Promise<Ergebnis>): Promise<Ergebnis> {
  try {
    return await arbeit();
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
}

/**
 * Eintrag einer besonderen Kategorie nach Art. 9 DSGVO (SecPlan 12).
 *
 * Das Recht `employees.sensitive` hat nur der Superadmin – bewusst. Der
 * Inhalt wird verschlüsselt abgelegt und steht nirgends im Protokoll:
 * die Zusammenfassung nennt nur die Kategorie, nicht den Wert.
 *
 * Die Rechtsgrundlage ist ein Pflichtfeld ohne Vorgabewert. Das System
 * darf sie nicht raten, und ein leeres Feld wäre genau das.
 */
export async function besondereKategorieAnlegen(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('employees.sensitive');

    const employeeId = String(formData.get('employeeId') ?? '');
    const kategorie = String(formData.get('kategorie') ?? '').trim();
    const inhalt = String(formData.get('inhalt') ?? '').trim();
    const grundlage = String(formData.get('grundlage') ?? '').trim();
    const bis = String(formData.get('bis') ?? '').trim();
    const loeschen = String(formData.get('loeschdatum') ?? '').trim();

    if (!verschluesselungBereit()) {
      throw new ValidationError(
        'Es ist kein Schlüssel für die Feldverschlüsselung hinterlegt (DATA_ENCRYPTION_KEY). '
        + 'Ohne ihn werden solche Angaben nicht gespeichert – das ist Absicht.',
      );
    }
    if (!kategorie) throw new ValidationError('Bitte benennen Sie die Kategorie.');
    if (!inhalt) throw new ValidationError('Bitte tragen Sie den Inhalt ein.');
    if (!grundlage) {
      throw new ValidationError(
        'Ohne Rechtsgrundlage wird nichts gespeichert. Welche trägt, ist eine rechtliche '
        + 'Entscheidung – das System trägt keine von sich aus ein.',
      );
    }
    if (!loeschen) throw new ValidationError('Bitte setzen Sie ein Löschdatum.');

    const person = await db.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!person) throw new ValidationError('Der Mitarbeiter wurde nicht gefunden.');

    const eintrag = await db.employeeSensitive.create({
      data: {
        employeeId: person.id,
        category: kategorie,
        valueEnc: verschluesseln(inhalt),
        lawfulBasis: grundlage,
        validUntil: bis ? new Date(`${bis}T00:00:00Z`) : null,
        deleteAt: new Date(`${loeschen}T00:00:00Z`),
        createdById: user.id,
      },
    });

    // Im Protokoll steht die Kategorie, nie der Inhalt.
    await audit(user, {
      action: 'employee.sensitive.create', entity: 'EmployeeSensitive', entityId: eintrag.id,
      summary: `Besondere Kategorie „${kategorie}" zu ${person.lastName}, ${person.firstName} erfasst`,
      after: { category: kategorie, lawfulBasis: grundlage },
      ip: await clientIp(),
    });

    revalidatePath(`/mitarbeiter/${person.id}/datenschutz`);
    return { erfolg: true, hinweis: 'Eintrag verschlüsselt gespeichert.' };
  });
}

/**
 * Inhalt eines Eintrags einmalig anzeigen.
 *
 * Kein normales Anzeigen in der Liste: wer den Wert braucht, fordert ihn
 * ausdrücklich an, und das steht im Protokoll. Ein Feld, das man beim
 * Scrollen mitliest, ist kein geschütztes Feld.
 */
export async function besondereKategorieLesen(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis & { geheimnis?: string }> {
  try {
    const user = await seite('employees.sensitive');
    const id = String(formData.get('id') ?? '');

    const eintrag = await db.employeeSensitive.findUnique({
      where: { id },
      select: { id: true, category: true, valueEnc: true, employeeId: true },
    });
    if (!eintrag) throw new ValidationError('Der Eintrag wurde nicht gefunden.');

    const { entschluesseln } = await import('@/lib/krypto');
    const inhalt = entschluesseln(eintrag.valueEnc);

    await audit(user, {
      action: 'employee.sensitive.read', entity: 'EmployeeSensitive', entityId: eintrag.id,
      summary: `Inhalt der Kategorie „${eintrag.category}" angesehen`,
      ip: await clientIp(),
    });

    return { erfolg: true, geheimnis: inhalt };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
}

/** Rechtsgrundlagen zur Auswahl – ohne Vorgabewert. */
export const GRUNDLAGEN: Array<{ wert: string; label: string }> = [
  { wert: 'Art. 9 Abs. 2 lit. b DSGVO i. V. m. § 26 Abs. 3 BDSG', label: 'Arbeitsrecht und soziale Sicherheit (Art. 9 Abs. 2 lit. b)' },
  { wert: 'Art. 9 Abs. 2 lit. a DSGVO', label: 'Ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a)' },
  { wert: 'Art. 9 Abs. 2 lit. h DSGVO', label: 'Gesundheitsvorsorge, Arbeitsmedizin (Art. 9 Abs. 2 lit. h)' },
  { wert: 'Art. 9 Abs. 2 lit. f DSGVO', label: 'Geltendmachung von Rechtsansprüchen (Art. 9 Abs. 2 lit. f)' },
];

export type Rechtsgrundlage = $Enums.RechtsgrundlageArt;
