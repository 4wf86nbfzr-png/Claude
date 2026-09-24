import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { audit, diff } from '../audit';
import { NotFoundError, ValidationError } from '../errors';
import { shiftMinutes, toDateOnly } from '../time';
import type { SessionUser } from '../auth/session';
import type { $Enums } from '@prisma/client';

/** Zeiterfassung (Spec 25/70). Zeiten kommen aus dem Abgleich, dem Check-in oder von Hand. */
const SCHEMA = z.object({
  employeeId: z.string().trim().min(1, 'Bitte wählen Sie einen Mitarbeiter.'),
  eventId: z.string().trim().optional().transform((v) => (v ? v : null)),
  positionId: z.string().trim().optional().transform((v) => (v ? v : null)),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte ein Datum wählen.'),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte eine Startzeit im Format HH:MM angeben.'),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte eine Endzeit im Format HH:MM angeben.'),
  breakMinutes: z.coerce.number().int().min(0).max(600).default(0),
  note: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
});

export async function zeitSpeichern(user: SessionUser, id: string | null, formData: FormData) {
  const ergebnis = SCHEMA.safeParse(Object.fromEntries(formData.entries()));
  if (!ergebnis.success) throw new ValidationError(ergebnis.error.issues[0]?.message ?? 'Bitte prüfen Sie Ihre Eingaben.');
  const eingabe = ergebnis.data;

  const minuten = shiftMinutes(eingabe.start, eingabe.end, eingabe.breakMinutes);
  if (minuten == null) throw new ValidationError('Die Zeiten konnten nicht berechnet werden.');
  if (minuten === 0) throw new ValidationError('Start und Ende ergeben keine Arbeitszeit. Bitte prüfen Sie die Eingabe.');

  const daten = {
    employeeId: eingabe.employeeId,
    eventId: eingabe.eventId,
    positionId: eingabe.positionId,
    date: toDateOnly(`${eingabe.date}T00:00:00Z`),
    start: eingabe.start,
    end: eingabe.end,
    breakMinutes: eingabe.breakMinutes,
    minutes: minuten,
    note: eingabe.note,
    updatedById: user.id,
  };

  if (id) {
    const vorher = await db.timeEntry.findFirst({ where: { id, deletedAt: null } });
    if (!vorher) throw new NotFoundError('Der Zeiteintrag wurde nicht gefunden.');
    if (vorher.status === 'ABGERECHNET') {
      throw new ValidationError('Abgerechnete Zeiten können nicht mehr geändert werden.');
    }
    await db.timeEntry.update({ where: { id }, data: daten });
    const unterschied = diff(vorher as unknown as Record<string, unknown>, daten as Record<string, unknown>);
    await audit(user, {
      action: 'timeentry.update', entity: 'TimeEntry', entityId: id,
      summary: `Zeiteintrag geändert (${unterschied.changed.join(', ')})`,
      before: unterschied.before, after: unterschied.after,
    });
    return id;
  }

  const eintrag = await db.timeEntry.create({
    data: { ...daten, source: 'MANUELL', status: 'GEPRUEFT', createdById: user.id },
  });
  await audit(user, {
    action: 'timeentry.create', entity: 'TimeEntry', entityId: eintrag.id,
    summary: `Zeiteintrag von Hand erfasst (${eingabe.date}, ${eingabe.start}–${eingabe.end})`,
    after: daten,
  });
  return eintrag.id;
}

export async function zeitenFreigeben(user: SessionUser, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const ergebnis = await db.timeEntry.updateMany({
    where: { id: { in: ids }, deletedAt: null, status: { in: ['OFFEN', 'GEPRUEFT'] } },
    data: { status: 'FREIGEGEBEN', updatedById: user.id },
  });
  await audit(user, {
    action: 'timeentry.approve', entity: 'TimeEntry',
    summary: `${ergebnis.count} Zeiteinträge freigegeben`,
    after: { ids },
  });
  return ergebnis.count;
}

export async function zeitStatus(user: SessionUser, id: string, status: $Enums.TimeEntryStatus) {
  const eintrag = await db.timeEntry.findFirst({ where: { id, deletedAt: null } });
  if (!eintrag) throw new NotFoundError('Der Zeiteintrag wurde nicht gefunden.');
  await db.timeEntry.update({ where: { id }, data: { status, updatedById: user.id } });
  await audit(user, {
    action: 'timeentry.status', entity: 'TimeEntry', entityId: id,
    summary: `Zeiteintrag: "${eintrag.status}" → "${status}"`,
    before: { status: eintrag.status }, after: { status },
  });
}

export async function zeitEntfernen(user: SessionUser, id: string, grund: string) {
  const eintrag = await db.timeEntry.findFirst({ where: { id, deletedAt: null } });
  if (!eintrag) throw new NotFoundError('Der Zeiteintrag wurde nicht gefunden.');
  if (eintrag.status === 'ABGERECHNET') throw new ValidationError('Abgerechnete Zeiten können nicht entfernt werden.');
  await db.timeEntry.update({ where: { id }, data: { deletedAt: new Date(), note: grund, updatedById: user.id } });
  await audit(user, {
    action: 'timeentry.delete', entity: 'TimeEntry', entityId: id,
    summary: `Zeiteintrag entfernt: ${grund}`, before: { start: eintrag.start, end: eintrag.end, minutes: eintrag.minutes },
  });
}
