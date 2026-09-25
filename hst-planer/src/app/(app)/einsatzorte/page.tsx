import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, toDateOnly } from '@/lib/time';
import { Karte, Leer, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Einsatzorte' };
export const dynamic = 'force-dynamic';

/**
 * Einsatzorte (SecPlan 2, Bereich EINSÄTZE).
 *
 * Kein eigener Stammdatensatz: der Ort steht am Event, und diese Seite
 * fasst zusammen, was daraus über die Zeit entstanden ist. Das ist
 * ehrlicher als eine gepflegte Ortsliste, die nach einem halben Jahr
 * nicht mehr zu den tatsächlichen Einsätzen passt.
 */
export default async function Einsatzorte({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('events.view');
  const params = await searchParams;
  const heute = toDateOnly(new Date());

  const events = await db.event.findMany({
    where: { ...eventFilter(user), ...(params.q ? { venue: { contains: params.q, mode: 'insensitive' } } : {}) },
    select: {
      id: true, name: true, date: true, venue: true, street: true, zip: true, city: true,
      meetingPoint: true, customer: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
    take: 600,
  });

  interface Ort {
    schluessel: string;
    name: string;
    anschrift: string;
    treffpunkt: string | null;
    kunden: Set<string>;
    anzahl: number;
    zuletzt: Date;
    naechster: { id: string; name: string; date: Date } | null;
  }

  const orte = new Map<string, Ort>();
  for (const event of events) {
    const name = event.venue?.trim() || event.city?.trim() || 'ohne Ortsangabe';
    const schluessel = name.toLowerCase();
    const vorhanden = orte.get(schluessel) ?? {
      schluessel, name,
      anschrift: [event.street, [event.zip, event.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      treffpunkt: event.meetingPoint,
      kunden: new Set<string>(),
      anzahl: 0,
      zuletzt: event.date,
      naechster: null,
    };
    vorhanden.anzahl += 1;
    if (event.customer) vorhanden.kunden.add(event.customer.name);
    if (event.date > vorhanden.zuletzt) vorhanden.zuletzt = event.date;
    if (event.date >= heute && (!vorhanden.naechster || event.date < vorhanden.naechster.date)) {
      vorhanden.naechster = { id: event.id, name: event.name, date: event.date };
    }
    if (!vorhanden.anschrift && event.city) vorhanden.anschrift = event.city;
    if (!vorhanden.treffpunkt && event.meetingPoint) vorhanden.treffpunkt = event.meetingPoint;
    orte.set(schluessel, vorhanden);
  }

  const liste = [...orte.values()].sort((a, b) => b.anzahl - a.anzahl);

  return (
    <>
      <Seitenkopf
        titel="Einsatzorte"
        unter={`${liste.length} Orte aus ${events.length} erfassten Einsätzen`}
      />

      <Karte>
        <form className="werkzeuge" role="search">
          <input name="q" className="feld feld-klein" defaultValue={params.q ?? ''}
                 placeholder="Ort suchen …" style={{ maxWidth: 260 }} aria-label="Ort suchen" />
          <button type="submit" className="knopf knopf-klein">Suchen</button>
          {params.q && <Link href="/einsatzorte" className="knopf knopf-klein knopf-still">Zurücksetzen</Link>}
        </form>

        {liste.length === 0 ? (
          <Leer>Kein Einsatzort gefunden.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Ort</th><th>Anschrift</th><th>Treffpunkt</th><th>Kunden</th><th>Einsätze</th><th>Zuletzt</th><th>Nächster</th></tr>
              </thead>
              <tbody>
                {liste.map((ort) => (
                  <tr key={ort.schluessel} className={ort.naechster ? 'zeile-blau' : undefined}>
                    <td style={{ fontWeight: 500 }}>{ort.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{ort.anschrift || '–'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{ort.treffpunkt ?? '–'}</td>
                    <td style={{ fontSize: 11 }}>
                      {[...ort.kunden].slice(0, 3).map((k) => (
                        <span key={k} className="marke marke-grau" style={{ marginRight: 3 }}>{k}</span>
                      ))}
                      {ort.kunden.size > 3 && <span className="marke marke-grau">+{ort.kunden.size - 3}</span>}
                    </td>
                    <td className="zahl">{ort.anzahl}</td>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(ort.zuletzt)}</td>
                    <td style={{ fontSize: 12 }}>
                      {ort.naechster
                        ? <Link href={`/events/${ort.naechster.id}`}>{formatDateDE(ort.naechster.date)}</Link>
                        : <span style={{ color: 'var(--text-3)' }}>–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}
