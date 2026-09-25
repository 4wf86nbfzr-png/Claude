'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { clientIp } from '@/lib/auth/session';
import { toPublicError } from '@/lib/errors';
import {
  eventAendern, eventAnlegen, eventArchivieren, eventDuplizieren,
  eventStornieren, pruefeEingabe, serieAnlegen,
} from '@/lib/domain/events';
import {
  mitarbeiterAntwort, statusSetzen, zuweisen, zuweisungEntfernen,
} from '@/lib/domain/assignments';
import { positionAnlegen, positionAendern, positionEntfernen } from '@/lib/domain/positions';
import { vorfallAnlegen, vorfallStatus } from '@/lib/domain/incidents';
import type { $Enums } from '@prisma/client';

export interface Ergebnis { fehler?: string; hinweis?: string; erfolg?: boolean; details?: unknown }

/** Einheitliche Klammer: fachliche Fehler werden zur Meldung, nicht zur Fehlerseite. */
async function fuehreAus(arbeit: () => Promise<Ergebnis | void>): Promise<Ergebnis> {
  try {
    return (await arbeit()) ?? { erfolg: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    const { body } = toPublicError(error);
    return { fehler: body.error, details: body.details };
  }
}

export async function eventSpeichern(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const id = String(formData.get('id') ?? '');
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('events.edit');
    const eingabe = pruefeEingabe(formData);
    const ip = await clientIp();
    const event = id
      ? await eventAendern(user, id, eingabe, { ip })
      : await eventAnlegen(user, eingabe, { ip });
    revalidatePath('/events');
    revalidatePath(`/events/${event.id}`);
    return { erfolg: true, hinweis: event.id };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/events/${ergebnis.hinweis}`);
}

export async function eventDuplizierenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  const ergebnis = await fuehreAus(async () => {
    const user = await seite('events.edit');
    const neu = await eventDuplizieren(user, String(formData.get('id')), {
      datum: String(formData.get('datum')),
      mitZuweisungen: formData.get('mitZuweisungen') === 'on',
      name: formData.get('name') ? String(formData.get('name')) : undefined,
    });
    revalidatePath('/events');
    return { erfolg: true, hinweis: neu.id };
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/events/${ergebnis.hinweis}`);
}

export async function serieAnlegenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('events.edit');
    const erzeugt = await serieAnlegen(user, String(formData.get('id')), {
      rhythmus: String(formData.get('rhythmus')) as 'TAEGLICH' | 'WOECHENTLICH' | 'ZWEIWOECHENTLICH' | 'MONATLICH',
      anzahl: Number(formData.get('anzahl') ?? 4),
      mitZuweisungen: formData.get('mitZuweisungen') === 'on',
    });
    revalidatePath('/events');
    revalidatePath('/kalender');
    return { erfolg: true, hinweis: `${erzeugt.length} Folgetermine angelegt.` };
  });
}

export async function eventStornierenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('events.edit');
    const id = String(formData.get('id'));
    await eventStornieren(user, id, String(formData.get('grund') ?? '').trim() || 'ohne Angabe');
    revalidatePath(`/events/${id}`);
    return { erfolg: true, hinweis: 'Das Event wurde storniert.' };
  });
}

export async function eventArchivierenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('events.edit');
    await eventArchivieren(user, String(formData.get('id')));
    revalidatePath('/events');
    return { erfolg: true, hinweis: 'Das Event wurde archiviert.' };
  });
}

// ----------------------------------------------------------------- Positionen

export async function positionSpeichern(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('dispo.edit');
    const id = String(formData.get('positionId') ?? '');
    const eventId = String(formData.get('eventId'));
    if (id) await positionAendern(user, id, formData);
    else await positionAnlegen(user, eventId, formData);
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/positionen`);
    revalidatePath('/disposition');
    return { erfolg: true, hinweis: 'Position gespeichert.' };
  });
}

export async function positionEntfernenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('dispo.edit');
    const eventId = String(formData.get('eventId'));
    await positionEntfernen(user, String(formData.get('positionId')));
    revalidatePath(`/events/${eventId}/positionen`);
    return { erfolg: true, hinweis: 'Position entfernt.' };
  });
}

// ----------------------------------------------------------------- Zuweisungen

export async function zuweisenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('dispo.edit');
    const eventId = String(formData.get('eventId'));
    await zuweisen(user, {
      positionId: String(formData.get('positionId')),
      employeeId: String(formData.get('employeeId')),
      roleInTeam: (formData.get('rolle') as $Enums.AssignmentRole) || 'MITARBEITER',
      isReserve: formData.get('ersatz') === 'on',
      status: (formData.get('status') as $Enums.AssignmentStatus) || 'ANGEFRAGT',
      noteForEmployee: String(formData.get('hinweis') ?? '').trim() || null,
      trotzdem: formData.get('trotzdem') === 'on',
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/mitarbeiter`);
    revalidatePath('/disposition');
    return { erfolg: true, hinweis: 'Mitarbeiter zugewiesen.' };
  });
}

export async function zuweisungEntfernenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('dispo.edit');
    const eventId = String(formData.get('eventId'));
    await zuweisungEntfernen(user, String(formData.get('assignmentId')), String(formData.get('grund') ?? '').trim() || undefined);
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/mitarbeiter`);
    revalidatePath('/disposition');
    return { erfolg: true, hinweis: 'Zuweisung entfernt.' };
  });
}

export async function zuweisungStatusAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('dispo.edit');
    const eventId = String(formData.get('eventId'));
    await statusSetzen(user, String(formData.get('assignmentId')), String(formData.get('status')) as $Enums.AssignmentStatus, String(formData.get('grund') ?? '').trim() || undefined);
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/mitarbeiter`);
    revalidatePath('/disposition');
    return { erfolg: true, hinweis: 'Status aktualisiert.' };
  });
}

/** Antwort des Mitarbeiters aus der mobilen Ansicht (Spec 13). */
export async function einsatzAntwortAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('self.shifts');
    await mitarbeiterAntwort(
      user,
      String(formData.get('assignmentId')),
      formData.get('antwort') === 'annehmen',
      String(formData.get('grund') ?? '').trim() || undefined,
    );
    revalidatePath('/meine-einsaetze');
    return { erfolg: true, hinweis: formData.get('antwort') === 'annehmen' ? 'Einsatz angenommen.' : 'Absage übermittelt.' };
  });
}

// ----------------------------------------------------------------- Vorfälle

export async function vorfallAnlegenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('events.view');
    const eventId = String(formData.get('eventId'));
    await vorfallAnlegen(user, eventId, formData);
    revalidatePath(`/events/${eventId}`);
    revalidatePath('/dashboard');
    return { erfolg: true, hinweis: 'Vorfall erfasst.' };
  });
}

export async function vorfallStatusAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('events.view');
    const eventId = String(formData.get('eventId'));
    await vorfallStatus(user, String(formData.get('incidentId')), String(formData.get('status')) as $Enums.IncidentStatus, String(formData.get('lösung') ?? '').trim() || undefined);
    revalidatePath(`/events/${eventId}`);
    revalidatePath('/dashboard');
    return { erfolg: true, hinweis: 'Vorfall aktualisiert.' };
  });
}
