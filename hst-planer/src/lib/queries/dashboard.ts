import 'server-only';
import { db } from '../db';
import { toDateOnly } from '../time';
import type { SessionUser } from '../auth/session';
import { besetzungAus, EVENT_MIT_BESETZUNG } from './coverage';
import { eventFilter } from './scope';

/** Alle Zahlen des Dashboards in moeglichst wenigen Abfragen (Spec 7/47). */
export async function dashboardDaten(user: SessionUser) {
  const heute = toDateOnly(new Date());
  const morgen = new Date(heute.getTime() + 86400000);
  const in30Tagen = new Date(heute.getTime() + 30 * 86400000);
  const vor7Tagen = new Date(heute.getTime() - 7 * 86400000);
  const sichtbar = eventFilter(user);

  const [heutigeEvents, kommendeEvents, offeneAnfragen, neueMails, neueMitarbeiter,
         offeneAbgleiche, problemZeiten, vorfaelle, ablaufendeNachweise, abgesagt] = await Promise.all([
    db.event.findMany({
      where: { ...sichtbar, date: { gte: heute, lt: morgen }, status: { notIn: ['STORNIERT'] } },
      select: {
        id: true, reference: true, name: true, venue: true, city: true, date: true,
        startTime: true, endTime: true, status: true, priority: true, meetingPoint: true, meetingTime: true,
        customer: { select: { name: true } },
        operationLead: { select: { firstName: true, lastName: true, mobile: true } },
        ...EVENT_MIT_BESETZUNG,
      },
      orderBy: { startTime: 'asc' },
    }),

    db.event.findMany({
      where: { ...sichtbar, date: { gte: morgen }, status: { notIn: ['STORNIERT', 'ABGESCHLOSSEN', 'ABGERECHNET'] } },
      select: {
        id: true, reference: true, name: true, venue: true, city: true, date: true,
        startTime: true, endTime: true, status: true, priority: true,
        customer: { select: { name: true } },
        operationLead: { select: { firstName: true, lastName: true } },
        ...EVENT_MIT_BESETZUNG,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 12,
    }),

    db.request.count({ where: { deletedAt: null, status: { in: ['NEU', 'IN_PRUEFUNG'] } } }),
    db.emailMessage.count({ where: { status: 'NEU' } }),
    db.employee.count({ where: { deletedAt: null, createdAt: { gte: vor7Tagen } } }),
    db.reconciliation.count({ where: { status: { in: ['ENTWURF', 'VERARBEITET'] } } }),
    db.timeEntry.count({ where: { deletedAt: null, status: 'OFFEN' } }),

    db.incident.findMany({
      where: { status: { in: ['OFFEN', 'IN_BEARBEITUNG'] }, event: sichtbar },
      select: {
        id: true, kind: true, status: true, priority: true, description: true, occurredAt: true,
        event: { select: { id: true, name: true, date: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ priority: 'desc' }, { occurredAt: 'desc' }],
      take: 8,
    }),

    // Qualifikationen und Dokumente mit Ablaufdatum (Spec 11)
    db.employeeQualification.findMany({
      where: { expiresAt: { not: null, lte: in30Tagen }, employee: { deletedAt: null, active: true } },
      select: {
        id: true, expiresAt: true,
        qualification: { select: { name: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { expiresAt: 'asc' },
      take: 10,
    }),

    db.assignment.count({
      where: { deletedAt: null, status: 'ABGESAGT', event: { ...sichtbar, date: { gte: heute } } },
    }),
  ]);

  const heuteBesetzung = heutigeEvents.reduce(
    (acc, event) => {
      const b = besetzungAus(event.positions);
      return { soll: acc.soll + b.soll, ist: acc.ist + b.ist, offen: acc.offen + b.offen };
    },
    { soll: 0, ist: 0, offen: 0 },
  );

  const unbesetzteEvents = [...heutigeEvents, ...kommendeEvents].filter((e) => {
    const b = besetzungAus(e.positions);
    return b.offen > 0;
  }).length;

  // SecPlan 3 unterscheidet zwei Dinge, die leicht vermischt werden:
  // eine OFFENE POSITION ist eine Stelle ohne Namen, eine UNBESETZTE
  // SCHICHT eine Stelle, auf der heute niemand steht – also eine, die
  // gleich beginnt und für die niemand zugesagt hat.
  const unbesetzteSchichten = heutigeEvents.reduce((summe, event) => {
    for (const position of event.positions) {
      const zugesagt = position.assignments.filter(
        (a) => !a.isReserve && ['ZUGESAGT', 'ERSCHIENEN', 'EINGETEILT'].includes(a.status),
      ).length;
      if (zugesagt === 0 && position.requiredCount > 0) summe += 1;
    }
    return summe;
  }, 0);

  const [aktiveEinsaetze, nichtErschienen, kurzfristigeAusfaelle] = await Promise.all([
    db.assignment.count({
      where: { deletedAt: null, status: { in: ['EINGETEILT', 'ZUGESAGT', 'ERSCHIENEN'] }, event: { date: { gte: heute, lt: morgen } } },
    }),
    db.assignment.count({
      where: { deletedAt: null, status: 'NICHT_ERSCHIENEN', event: { date: { gte: heute, lt: morgen } } },
    }),
    // Kurzfristig heisst: die Absage kam, als der Einsatz schon in den
    // naechsten 72 Stunden lag. Genau die kosten die Disposition den Abend.
    db.assignment.count({
      where: {
        deletedAt: null,
        status: { in: ['ABGESAGT', 'NICHT_ERSCHIENEN'] },
        event: { ...sichtbar, date: { gte: heute, lte: new Date(heute.getTime() + 3 * 86400000) } },
      },
    }),
  ]);

  return {
    heute: {
      events: heutigeEvents,
      aktiveEinsaetze,
      besetzung: heuteBesetzung,
      nichtErschienen,
      verspaetet: vorfaelle.filter((v) => v.kind === 'VERSPAETET').length,
      kritisch: vorfaelle.filter((v) => v.priority === 'KRITISCH' || v.priority === 'HOCH').length,
      unbesetzteSchichten,
      kurzfristigeAusfaelle,
      hinweise: vorfaelle.length + ablaufendeNachweise.length,
    },
    kommendeEvents,
    dispo: {
      offeneAnfragen, neueMails, neueMitarbeiter, offeneAbgleiche,
      problemZeiten, unbesetzteEvents, abgesagt,
    },
    vorfaelle,
    ablaufendeNachweise,
  };
}
