import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { audit, diff } from '../audit';
import { nextReference } from '../refs';
import { NotFoundError, ValidationError, ConflictError } from '../errors';
import { notifyDispo, notifyUsers } from '../notify';
import { dispatchWebhook } from '../webhooks';
import { statusNachziehen } from '../queries/coverage';
import { shiftMinutes, toDateOnly } from '../time';
import type { SessionUser } from '../auth/session';

const ZEIT = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte im Format HH:MM angeben.');
const optionaleZeit = z.union([ZEIT, z.literal('')]).optional().transform((v) => (v ? v : null));
const optionalerText = (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const EVENT_SCHEMA = z.object({
  name: z.string().trim().min(3, 'Bitte geben Sie einen Eventnamen an.').max(200),
  customerId: z.string().trim().optional().transform((v) => (v ? v : null)),
  serviceTypeId: z.string().trim().optional().transform((v) => (v ? v : null)),
  contactName: optionalerText(120),
  contactPhone: optionalerText(60),
  contactEmail: z.union([z.string().trim().email('Bitte eine gültige E-Mail-Adresse angeben.'), z.literal('')]).optional().transform((v) => (v ? v : null)),
  venue: optionalerText(160),
  street: optionalerText(160),
  zip: optionalerText(10),
  city: optionalerText(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte ein Datum wählen.'),
  startTime: optionaleZeit,
  endTime: optionaleZeit,
  buildUpTime: optionaleZeit,
  teardownTime: optionaleZeit,
  meetingPoint: optionalerText(200),
  meetingTime: optionaleZeit,
  eventKind: optionalerText(100),
  priority: z.enum(['NIEDRIG', 'NORMAL', 'HOCH', 'KRITISCH']).default('NORMAL'),
  status: z.enum(['ANFRAGE', 'PLANUNG', 'TEILBESETZT', 'BESETZT', 'BESTAETIGT', 'LAUFEND', 'ABGESCHLOSSEN', 'ABGERECHNET', 'STORNIERT']).default('PLANUNG'),
  dressCode: optionalerText(300),
  tasks: optionalerText(2000),
  hints: optionalerText(2000),
  notesInternal: optionalerText(2000),
  operationLeadId: z.string().trim().optional().transform((v) => (v ? v : null)),
  revenue: z.union([z.string().trim(), z.literal('')]).optional().transform((v) => (v ? v.replace(',', '.') : null)),
});

export type EventEingabe = z.infer<typeof EVENT_SCHEMA>;

export async function eventAnlegen(user: SessionUser, eingabe: EventEingabe, options: { ip?: string } = {}) {
  const reference = await nextReference('EV');
  const event = await db.event.create({
    data: {
      ...zuDaten(eingabe),
      reference,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await audit(user, {
    action: 'event.create', entity: 'Event', entityId: event.id,
    summary: `Event ${event.reference} "${event.name}" angelegt`, after: event, ip: options.ip,
  });
  await dispatchWebhook('event.created', { id: event.id, reference: event.reference, name: event.name, date: event.date });
  return event;
}

export async function eventAendern(user: SessionUser, id: string, eingabe: EventEingabe, options: { ip?: string } = {}) {
  const vorher = await db.event.findFirst({ where: { id, deletedAt: null } });
  if (!vorher) throw new NotFoundError('Das Event wurde nicht gefunden.');

  const daten = zuDaten(eingabe);
  const unterschied = diff(vorher as unknown as Record<string, unknown>, daten as Record<string, unknown>);
  if (!unterschied.changed.length) return vorher;

  const event = await db.event.update({ where: { id }, data: { ...daten, updatedById: user.id } });

  await audit(user, {
    action: 'event.update', entity: 'Event', entityId: id,
    summary: `Event ${event.reference} geändert (${unterschied.changed.join(', ')})`,
    before: unterschied.before, after: unterschied.after, ip: options.ip,
  });
  await dispatchWebhook('event.updated', { id: event.id, reference: event.reference, geaendert: unterschied.changed });

  // Mitarbeiter müssen wissen, wenn sich Zeit oder Ort ihres Einsatzes ändert.
  const relevant = ['date', 'startTime', 'endTime', 'venue', 'meetingPoint', 'meetingTime', 'dressCode'];
  if (unterschied.changed.some((feld) => relevant.includes(feld))) {
    const betroffene = await db.assignment.findMany({
      where: { eventId: id, deletedAt: null, status: { in: ['ANGEFRAGT', 'ZUGESAGT', 'EINGETEILT'] } },
      select: { employee: { select: { user: { select: { id: true } } } } },
    });
    const userIds = betroffene.map((a) => a.employee.user?.id).filter((v): v is string => Boolean(v));
    await notifyUsers(userIds, {
      kind: 'SYSTEM',
      title: `Änderung bei "${event.name}"`,
      body: 'Die Einsatzdaten haben sich geändert. Bitte prüfen Sie die Einzelheiten.',
      link: `/meine-einsaetze`,
    });
  }
  return event;
}

function zuDaten(eingabe: EventEingabe) {
  return {
    name: eingabe.name,
    customerId: eingabe.customerId,
    serviceTypeId: eingabe.serviceTypeId,
    contactName: eingabe.contactName,
    contactPhone: eingabe.contactPhone,
    contactEmail: eingabe.contactEmail,
    venue: eingabe.venue,
    street: eingabe.street,
    zip: eingabe.zip,
    city: eingabe.city,
    date: toDateOnly(`${eingabe.date}T00:00:00Z`),
    startTime: eingabe.startTime,
    endTime: eingabe.endTime,
    buildUpTime: eingabe.buildUpTime,
    teardownTime: eingabe.teardownTime,
    meetingPoint: eingabe.meetingPoint,
    meetingTime: eingabe.meetingTime,
    eventKind: eingabe.eventKind,
    priority: eingabe.priority,
    status: eingabe.status,
    dressCode: eingabe.dressCode,
    tasks: eingabe.tasks,
    hints: eingabe.hints,
    notesInternal: eingabe.notesInternal,
    operationLeadId: eingabe.operationLeadId,
    revenue: eingabe.revenue,
  };
}

/**
 * Event duplizieren (Spec 33). Positionen werden immer übernommen,
 * Mitarbeiter-Zuweisungen nur auf Wunsch – und dann als Vorschlag, nicht
 * als feste Einteilung, damit niemand versehentlich verplant wird.
 */
export async function eventDuplizieren(
  user: SessionUser,
  id: string,
  optionen: { datum: string; mitZuweisungen: boolean; name?: string },
) {
  const quelle = await db.event.findFirst({
    where: { id, deletedAt: null },
    include: {
      positions: { include: { requirements: true }, orderBy: { sortOrder: 'asc' } },
      assignments: { where: { deletedAt: null } },
    },
  });
  if (!quelle) throw new NotFoundError('Das Event wurde nicht gefunden.');

  const reference = await nextReference('EV');
  const neu = await db.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        reference,
        name: optionen.name?.trim() || quelle.name,
        customerId: quelle.customerId, serviceTypeId: quelle.serviceTypeId,
        contactName: quelle.contactName, contactPhone: quelle.contactPhone, contactEmail: quelle.contactEmail,
        venue: quelle.venue, street: quelle.street, zip: quelle.zip, city: quelle.city,
        date: toDateOnly(`${optionen.datum}T00:00:00Z`),
        startTime: quelle.startTime, endTime: quelle.endTime,
        buildUpTime: quelle.buildUpTime, teardownTime: quelle.teardownTime,
        meetingPoint: quelle.meetingPoint, meetingTime: quelle.meetingTime,
        eventKind: quelle.eventKind, priority: quelle.priority,
        status: 'PLANUNG',
        dressCode: quelle.dressCode, tasks: quelle.tasks, hints: quelle.hints,
        notesInternal: quelle.notesInternal,
        operationLeadId: quelle.operationLeadId,
        createdById: user.id, updatedById: user.id,
      },
    });

    for (const position of quelle.positions) {
      const kopie = await tx.position.create({
        data: {
          eventId: event.id, title: position.title, serviceTypeId: position.serviceTypeId,
          requiredCount: position.requiredCount, startTime: position.startTime, endTime: position.endTime,
          breakMinutes: position.breakMinutes, dressCode: position.dressCode, note: position.note,
          sortOrder: position.sortOrder, hourlyRate: position.hourlyRate,
          requirements: { create: position.requirements.map((r) => ({ qualificationId: r.qualificationId, mandatory: r.mandatory })) },
        },
      });

      if (optionen.mitZuweisungen) {
        const uebernehmen = quelle.assignments.filter((a) => a.positionId === position.id && a.status !== 'ABGESAGT');
        for (const assignment of uebernehmen) {
          await tx.assignment.create({
            data: {
              eventId: event.id, positionId: kopie.id, employeeId: assignment.employeeId,
              partnerId: assignment.partnerId, roleInTeam: assignment.roleInTeam, isReserve: assignment.isReserve,
              status: 'VORGESCHLAGEN',
              plannedStart: assignment.plannedStart, plannedEnd: assignment.plannedEnd,
              plannedBreakMinutes: assignment.plannedBreakMinutes,
              createdById: user.id, updatedById: user.id,
            },
          });
        }
      }
    }
    return event;
  });

  await audit(user, {
    action: 'event.duplicate', entity: 'Event', entityId: neu.id,
    summary: `Event ${quelle.reference} als ${neu.reference} dupliziert${optionen.mitZuweisungen ? ' (mit Zuweisungen)' : ''}`,
  });
  await statusNachziehen(neu.id);
  return neu;
}

/**
 * Wiederkehrende Events (Spec 34). Erzeugt bis zu `anzahl` Folgetermine
 * und verbindet sie über `seriesId`, damit sie später als Serie erkennbar sind.
 */
export async function serieAnlegen(
  user: SessionUser,
  id: string,
  optionen: { rhythmus: 'TAEGLICH' | 'WOECHENTLICH' | 'ZWEIWOECHENTLICH' | 'MONATLICH'; anzahl: number; mitZuweisungen: boolean },
) {
  const anzahl = Math.min(52, Math.max(1, Math.round(optionen.anzahl)));
  const quelle = await db.event.findFirst({ where: { id, deletedAt: null }, select: { id: true, date: true, seriesId: true } });
  if (!quelle) throw new NotFoundError('Das Event wurde nicht gefunden.');

  const seriesId = quelle.seriesId ?? quelle.id;
  if (!quelle.seriesId) await db.event.update({ where: { id }, data: { seriesId } });

  const erzeugt: string[] = [];
  for (let i = 1; i <= anzahl; i++) {
    const datum = new Date(quelle.date);
    switch (optionen.rhythmus) {
      case 'TAEGLICH': datum.setUTCDate(datum.getUTCDate() + i); break;
      case 'WOECHENTLICH': datum.setUTCDate(datum.getUTCDate() + 7 * i); break;
      case 'ZWEIWOECHENTLICH': datum.setUTCDate(datum.getUTCDate() + 14 * i); break;
      case 'MONATLICH': datum.setUTCMonth(datum.getUTCMonth() + i); break;
    }
    const neu = await eventDuplizieren(user, id, {
      datum: datum.toISOString().slice(0, 10),
      mitZuweisungen: optionen.mitZuweisungen,
    });
    await db.event.update({ where: { id: neu.id }, data: { seriesId } });
    erzeugt.push(neu.id);
  }

  await audit(user, {
    action: 'event.series', entity: 'Event', entityId: id,
    summary: `Serie mit ${erzeugt.length} Folgeterminen angelegt (${optionen.rhythmus.toLowerCase()})`,
  });
  return erzeugt;
}

/** Events werden archiviert, nicht gelöscht (Spec 73). */
export async function eventArchivieren(user: SessionUser, id: string) {
  const event = await db.event.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw new NotFoundError('Das Event wurde nicht gefunden.');
  await db.event.update({ where: { id }, data: { archivedAt: new Date(), updatedById: user.id } });
  await audit(user, { action: 'event.archive', entity: 'Event', entityId: id, summary: `Event ${event.reference} archiviert` });
}

export async function eventStornieren(user: SessionUser, id: string, grund: string) {
  const event = await db.event.findFirst({ where: { id, deletedAt: null }, include: { assignments: { where: { deletedAt: null } } } });
  if (!event) throw new NotFoundError('Das Event wurde nicht gefunden.');
  if (event.status === 'ABGERECHNET') throw new ConflictError('Ein abgerechnetes Event kann nicht mehr storniert werden.');

  await db.$transaction([
    db.event.update({ where: { id }, data: { status: 'STORNIERT', updatedById: user.id, notesInternal: `${event.notesInternal ?? ''}\nStorniert: ${grund}`.trim() } }),
    db.assignment.updateMany({ where: { eventId: id, deletedAt: null }, data: { status: 'STORNIERT' } }),
  ]);

  const betroffene = await db.employee.findMany({
    where: { id: { in: event.assignments.map((a) => a.employeeId) } },
    select: { user: { select: { id: true } } },
  });
  await notifyUsers(betroffene.map((e) => e.user?.id).filter((v): v is string => Boolean(v)), {
    kind: 'EINSATZ_ABGESAGT',
    title: `Einsatz abgesagt: ${event.name}`,
    body: grund,
    link: '/meine-einsaetze',
  });
  await notifyDispo({
    kind: 'EINSATZ_ABGESAGT',
    title: `Event storniert: ${event.name}`,
    body: grund,
    link: `/events/${id}`,
    webhookEvent: 'event.updated',
    webhookPayload: { id, status: 'STORNIERT' },
  });

  await audit(user, { action: 'event.cancel', entity: 'Event', entityId: id, summary: `Event ${event.reference} storniert: ${grund}` });
}

/** Geplante Minuten einer Zuweisung – fällt auf Position und Event zurück. */
export function geplanteZeiten(
  assignment: { plannedStart: string | null; plannedEnd: string | null; plannedBreakMinutes: number },
  position: { startTime: string | null; endTime: string | null; breakMinutes: number },
  event: { startTime: string | null; endTime: string | null },
): { start: string | null; end: string | null; pause: number; minuten: number | null } {
  const start = assignment.plannedStart ?? position.startTime ?? event.startTime;
  const end = assignment.plannedEnd ?? position.endTime ?? event.endTime;
  const pause = assignment.plannedBreakMinutes || position.breakMinutes || 0;
  return { start, end, pause, minuten: start && end ? shiftMinutes(start, end, pause) : null };
}

export function pruefeEingabe(formData: FormData): EventEingabe {
  const roh = Object.fromEntries(formData.entries());
  const ergebnis = EVENT_SCHEMA.safeParse(roh);
  if (!ergebnis.success) {
    const erstes = ergebnis.error.issues[0];
    throw new ValidationError(erstes?.message ?? 'Bitte prüfen Sie Ihre Eingaben.');
  }
  return ergebnis.data;
}
