import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE, formatHours, minutesToHours } from '@/lib/time';
import { monatsZeitraum } from '@/lib/queries/statistik';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { Zeitraumfilter } from '../auswertungen/filter';

export const metadata: Metadata = { title: 'Finanzen' };
export const dynamic = 'force-dynamic';

/**
 * Finanzielle Vorbereitung (Spec 40).
 *
 * Bewusst keine Buchhaltung: Die Seite rechnet aus den vorhandenen Saetzen
 * (Kunde, Mitarbeiter, Partner) und den erfassten Zeiten eine
 * Deckungsbeitragsschaetzung. Sie ersetzt keine Rechnung und keine Lohnabrechnung.
 */
export default async function Finanzen({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await seite('finance.view');
  const params = await searchParams;
  const heute = new Date();
  const jahr = Number(params.jahr ?? heute.getUTCFullYear());
  const monat = Number(params.monat ?? heute.getUTCMonth() + 1);
  const { von, bis } = monatsZeitraum(jahr, monat);

  const zeiten = await db.timeEntry.findMany({
    where: { deletedAt: null, date: { gte: von, lte: bis } },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, hourlyRate: true, partner: { select: { id: true, name: true, hourlyRate: true } } } },
      event: { select: { id: true, name: true, revenue: true, customer: { select: { id: true, name: true, hourlyRate: true } } } },
      position: { select: { hourlyRate: true } },
    },
  });

  interface Zeile { id: string; name: string; minuten: number; erloes: number; kosten: number }
  const jeEvent = new Map<string, Zeile>();
  let gesamtMinuten = 0, gesamtErloes = 0, gesamtKosten = 0;

  for (const eintrag of zeiten) {
    const stunden = eintrag.minutes / 60;
    const kundensatz = Number(eintrag.position?.hourlyRate ?? eintrag.event?.customer?.hourlyRate ?? 0);
    // Partnerkraefte werden mit dem Partnersatz verrechnet, eigene mit dem Mitarbeitersatz.
    const kostensatz = Number(eintrag.employee.partner?.hourlyRate ?? eintrag.employee.hourlyRate ?? 0);

    const erloes = stunden * kundensatz;
    const kosten = stunden * kostensatz;

    gesamtMinuten += eintrag.minutes;
    gesamtErloes += erloes;
    gesamtKosten += kosten;

    const schluessel = eintrag.eventId ?? 'ohne';
    const vorhanden = jeEvent.get(schluessel) ?? {
      id: schluessel,
      name: eintrag.event?.name ?? 'ohne Event',
      minuten: 0, erloes: 0, kosten: 0,
    };
    vorhanden.minuten += eintrag.minutes;
    vorhanden.erloes += erloes;
    vorhanden.kosten += kosten;
    jeEvent.set(schluessel, vorhanden);
  }

  const marge = gesamtErloes - gesamtKosten;
  const margeProzent = gesamtErloes > 0 ? Math.round((marge / gesamtErloes) * 100) : 0;
  const ohneSatz = zeiten.filter((z) => !z.employee.partner?.hourlyRate && !z.employee.hourlyRate).length;

  return (
    <>
      <Seitenkopf titel="Finanzen" unter={`${formatDateDE(von)} – ${formatDateDE(bis)} · Schaetzung aus erfassten Zeiten`} />
      <Zeitraumfilter jahr={jahr} monat={monat} />

      <div style={{ marginTop: 14 }}>
        <Hinweis art="info">
          Diese Seite ist eine Vorbereitung fuer die Abrechnung, keine Buchhaltung. Gerechnet wird
          mit den hinterlegten Stundensaetzen: Position &gt; Kunde fuer den Erloes, Partner &gt; Mitarbeiter
          fuer die Kosten. Ohne hinterlegte Saetze bleibt die Zeile bei null.
        </Hinweis>
      </div>

      <div style={{ marginTop: 14 }}>
        <Raster min={170}>
          <Kennzahl wert={formatHours(gesamtMinuten)} label="Abrechenbare Stunden" hinweis={`${minutesToHours(gesamtMinuten).toLocaleString('de-DE')} dezimal`} />
          <Kennzahl wert={`${gesamtErloes.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`} label="Erloes (geschaetzt)" />
          <Kennzahl wert={`${gesamtKosten.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`} label="Personalkosten (geschaetzt)" />
          <Kennzahl wert={`${marge.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`} label="Marge"
                    farbe={marge > 0 ? 'gruen' : marge < 0 ? 'rot' : 'grau'} hinweis={`${margeProzent} %`} />
          <Kennzahl wert={ohneSatz} label="Zeiten ohne Stundensatz" farbe={ohneSatz > 0 ? 'gelb' : 'gruen'} />
        </Raster>
      </div>

      <div style={{ marginTop: 16 }}>
        <Karte titel="Je Event">
          {jeEvent.size === 0 ? <Leer>Im Zeitraum wurden keine Zeiten erfasst.</Leer> : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead><tr><th>Event</th><th>Stunden</th><th>Erloes</th><th>Kosten</th><th>Marge</th><th>Quote</th></tr></thead>
                <tbody>
                  {[...jeEvent.values()].sort((a, b) => b.erloes - a.erloes).map((zeile) => {
                    const zeilenMarge = zeile.erloes - zeile.kosten;
                    const quote = zeile.erloes > 0 ? Math.round((zeilenMarge / zeile.erloes) * 100) : 0;
                    return (
                      <tr key={zeile.id}>
                        <td>{zeile.id === 'ohne' ? zeile.name : <Link href={`/events/${zeile.id}`}>{zeile.name}</Link>}</td>
                        <td className="zahl">{formatHours(zeile.minuten)}</td>
                        <td className="zahl">{zeile.erloes.toLocaleString('de-DE', { maximumFractionDigits: 2 })} €</td>
                        <td className="zahl">{zeile.kosten.toLocaleString('de-DE', { maximumFractionDigits: 2 })} €</td>
                        <td className="zahl" style={{ fontWeight: 600, color: zeilenMarge >= 0 ? 'var(--gruen)' : 'var(--rot)' }}>
                          {zeilenMarge.toLocaleString('de-DE', { maximumFractionDigits: 2 })} €
                        </td>
                        <td className="zahl">{zeile.erloes > 0 ? `${quote} %` : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Karte>
      </div>
    </>
  );
}
