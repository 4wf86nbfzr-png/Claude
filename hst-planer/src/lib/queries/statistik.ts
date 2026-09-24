import 'server-only';
import { db } from '../db';
import { toDateOnly } from '../time';
import { besetzungAus, EVENT_MIT_BESETZUNG } from './coverage';

/** Auswertungen (Spec 39). Zeitraum inklusive beider Grenzen. */
export interface Zeitraum { von: Date; bis: Date }

export function monatsZeitraum(jahr: number, monat: number): Zeitraum {
  return {
    von: new Date(Date.UTC(jahr, monat - 1, 1)),
    bis: new Date(Date.UTC(jahr, monat, 0)),
  };
}

export async function statistik(zeitraum: Zeitraum) {
  const { von, bis } = zeitraum;
  const eventFilter = { deletedAt: null, date: { gte: von, lte: bis } };

  const [events, zuweisungen, zeiten, vorfaelle, kunden, partnerEinsaetze] = await Promise.all([
    db.event.findMany({
      where: eventFilter,
      select: {
        id: true, status: true, date: true, revenue: true,
        customer: { select: { id: true, name: true } },
        serviceType: { select: { code: true, name: true } },
        ...EVENT_MIT_BESETZUNG,
      },
    }),
    db.assignment.findMany({
      where: { deletedAt: null, event: eventFilter },
      select: { id: true, status: true, createdAt: true, respondedAt: true, isReserve: true, event: { select: { date: true } } },
    }),
    db.timeEntry.aggregate({
      where: { deletedAt: null, date: { gte: von, lte: bis } },
      _sum: { minutes: true }, _count: true,
    }),
    db.incident.groupBy({
      by: ['kind'], where: { event: eventFilter }, _count: true,
    }),
    db.event.groupBy({
      by: ['customerId'], where: eventFilter, _count: true,
    }),
    db.assignment.count({ where: { deletedAt: null, partnerId: { not: null }, event: eventFilter } }),
  ]);

  const besetzung = events.reduce(
    (acc, event) => {
      const b = besetzungAus(event.positions);
      return { soll: acc.soll + b.soll, ist: acc.ist + b.ist, bestaetigt: acc.bestaetigt + b.bestaetigt, offen: acc.offen + b.offen };
    },
    { soll: 0, ist: 0, bestaetigt: 0, offen: 0 },
  );

  const absagen = zuweisungen.filter((a) => a.status === 'ABGESAGT');
  // Kurzfristig = Absage weniger als 48 Stunden vor dem Einsatz
  const kurzfristig = absagen.filter((a) =>
    a.respondedAt && a.event.date.getTime() - a.respondedAt.getTime() < 48 * 3600000,
  ).length;

  const beantwortet = zuweisungen.filter((a) => a.respondedAt);
  const reaktionsMinuten = beantwortet.length
    ? Math.round(beantwortet.reduce((s, a) => s + (a.respondedAt!.getTime() - a.createdAt.getTime()) / 60000, 0) / beantwortet.length)
    : 0;

  const nachBereich = new Map<string, { name: string; events: number; soll: number; ist: number }>();
  for (const event of events) {
    const schluessel = event.serviceType?.code ?? 'OHNE';
    const name = event.serviceType?.name ?? 'ohne Bereich';
    const b = besetzungAus(event.positions);
    const vorhanden = nachBereich.get(schluessel) ?? { name, events: 0, soll: 0, ist: 0 };
    vorhanden.events++; vorhanden.soll += b.soll; vorhanden.ist += b.ist;
    nachBereich.set(schluessel, vorhanden);
  }

  const kundenNamen = new Map(events.filter((e) => e.customer).map((e) => [e.customer!.id, e.customer!.name]));
  const nachKunde = kunden
    .filter((k) => k.customerId)
    .map((k) => ({ id: k.customerId!, name: kundenNamen.get(k.customerId!) ?? 'unbekannt', events: k._count }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 10);

  const umsatz = events.reduce((summe, event) => summe + Number(event.revenue ?? 0), 0);

  return {
    zeitraum,
    events: {
      gesamt: events.length,
      abgeschlossen: events.filter((e) => ['ABGESCHLOSSEN', 'ABGERECHNET'].includes(e.status)).length,
      storniert: events.filter((e) => e.status === 'STORNIERT').length,
    },
    besetzung: {
      ...besetzung,
      quote: besetzung.soll > 0 ? Math.round((besetzung.ist / besetzung.soll) * 100) : 0,
      zusagequote: besetzung.ist > 0 ? Math.round((besetzung.bestaetigt / besetzung.ist) * 100) : 0,
    },
    stunden: { minuten: zeiten._sum.minutes ?? 0, eintraege: zeiten._count },
    ausfaelle: {
      absagen: absagen.length,
      kurzfristig,
      nichtErschienen: zuweisungen.filter((a) => a.status === 'NICHT_ERSCHIENEN').length,
      reaktionsMinuten,
    },
    vorfaelle: vorfaelle.map((v) => ({ art: v.kind, anzahl: v._count })),
    nachBereich: [...nachBereich.values()].sort((a, b) => b.events - a.events),
    nachKunde,
    partnerEinsaetze,
    umsatz,
  };
}

/** Monatsvergleich der letzten zwoelf Monate. */
export async function monatsverlauf(monate = 12) {
  const heute = toDateOnly(new Date());
  const ergebnis: Array<{ monat: string; events: number; stunden: number; offen: number }> = [];

  for (let i = monate - 1; i >= 0; i--) {
    const jahr = heute.getUTCFullYear();
    const monat = heute.getUTCMonth() - i;
    const zeitraum = monatsZeitraum(jahr, monat + 1);
    const [events, zeiten] = await Promise.all([
      db.event.findMany({
        where: { deletedAt: null, date: { gte: zeitraum.von, lte: zeitraum.bis } },
        select: EVENT_MIT_BESETZUNG,
      }),
      db.timeEntry.aggregate({
        where: { deletedAt: null, date: { gte: zeitraum.von, lte: zeitraum.bis } },
        _sum: { minutes: true },
      }),
    ]);
    const offen = events.reduce((summe, event) => summe + besetzungAus(event.positions).offen, 0);
    ergebnis.push({
      monat: `${String(zeitraum.von.getUTCMonth() + 1).padStart(2, '0')}/${zeitraum.von.getUTCFullYear()}`,
      events: events.length,
      stunden: Math.round((zeiten._sum.minutes ?? 0) / 60),
      offen,
    });
  }
  return ergebnis;
}
