import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatHours, isoDate, toDateOnly } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Arbeitszeiten' };
export const dynamic = 'force-dynamic';

/**
 * Arbeitszeiten (SecPlan 2, Bereich ZEITERFASSUNG).
 *
 * Die Stundenzettel-Seite zeigt Einträge. Diese hier zeigt Summen je
 * Person und Monat – und markiert, wo eine Woche über 48 Stunden kommt.
 * Die Zahl ist ein Hinweis nach § 3 ArbZG, keine Feststellung: ob im
 * Ausgleichszeitraum alles passt, entscheidet die Personalabteilung.
 */
export default async function Arbeitszeiten({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('timesheets.view');
  const params = await searchParams;

  const heute = toDateOnly(new Date());
  const monat = params.monat && /^\d{4}-\d{2}$/.test(params.monat)
    ? params.monat
    : `${heute.getUTCFullYear()}-${String(heute.getUTCMonth() + 1).padStart(2, '0')}`;
  const [jahr, mon] = monat.split('-').map(Number) as [number, number];
  const von = new Date(Date.UTC(jahr, mon - 1, 1));
  const bis = new Date(Date.UTC(jahr, mon, 0));

  const where = {
    deletedAt: null,
    date: { gte: von, lte: bis },
    ...(user.scope === 'EIGENE' ? { employeeId: user.employeeId ?? '__keiner__' } : {}),
    ...(user.scope === 'PARTNER' ? { employee: { partnerId: user.partnerId ?? '__kein_partner__' } } : {}),
  };

  const zeiten = await db.timeEntry.findMany({
    where,
    select: {
      id: true, date: true, minutes: true, status: true,
      employee: { select: { id: true, firstName: true, lastName: true, personnelNo: true } },
    },
    orderBy: { date: 'asc' },
  });

  interface Zeile {
    id: string; name: string; personalNr: string;
    summe: number; offen: number; tage: Set<string>;
    wochen: Map<number, number>;
  }
  const zeilen = new Map<string, Zeile>();

  /** ISO-Kalenderwoche – Montag als erster Tag. */
  function kalenderwoche(datum: Date): number {
    const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
    const wochentag = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - wochentag);
    const jahresbeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - jahresbeginn.getTime()) / 86400000 + 1) / 7);
  }

  for (const eintrag of zeiten) {
    const vorhanden = zeilen.get(eintrag.employee.id) ?? {
      id: eintrag.employee.id,
      name: `${eintrag.employee.lastName}, ${eintrag.employee.firstName}`,
      personalNr: eintrag.employee.personnelNo,
      summe: 0, offen: 0, tage: new Set<string>(), wochen: new Map<number, number>(),
    };
    vorhanden.summe += eintrag.minutes;
    if (eintrag.status === 'OFFEN') vorhanden.offen += eintrag.minutes;
    vorhanden.tage.add(isoDate(eintrag.date));
    const kw = kalenderwoche(eintrag.date);
    vorhanden.wochen.set(kw, (vorhanden.wochen.get(kw) ?? 0) + eintrag.minutes);
    zeilen.set(eintrag.employee.id, vorhanden);
  }

  const liste = [...zeilen.values()].sort((a, b) => b.summe - a.summe);
  const gesamt = liste.reduce((s, z) => s + z.summe, 0);
  const ueber48 = liste.filter((z) => [...z.wochen.values()].some((m) => m > 48 * 60));

  const vorMonat = new Date(Date.UTC(jahr, mon - 2, 1));
  const nachMonat = new Date(Date.UTC(jahr, mon, 1));
  const schluessel = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

  return (
    <>
      <Seitenkopf
        titel="Arbeitszeiten"
        unter={`${von.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })} · Summen je Mitarbeiter`}
        aktionen={
          <>
            <Link href={`/zeiterfassung/arbeitszeiten?monat=${schluessel(vorMonat)}`} className="knopf knopf-klein">← Vormonat</Link>
            <Link href="/zeiterfassung/arbeitszeiten" className="knopf knopf-klein">Aktueller Monat</Link>
            <Link href={`/zeiterfassung/arbeitszeiten?monat=${schluessel(nachMonat)}`} className="knopf knopf-klein">Folgemonat →</Link>
          </>
        }
      />

      <Raster min={160}>
        <Kennzahl wert={formatHours(gesamt)} label="Stunden im Monat" />
        <Kennzahl wert={liste.length} label="Mitarbeiter mit Zeiten" />
        <Kennzahl wert={formatHours(liste.reduce((s, z) => s + z.offen, 0))} label="Noch nicht freigegeben"
                  href="/zeiterfassung/freigaben"
                  farbe={liste.some((z) => z.offen > 0) ? 'gelb' : 'gruen'} />
        <Kennzahl wert={ueber48.length} label="Wochen über 48 Stunden"
                  hinweis="Hinweis nach § 3 ArbZG"
                  farbe={ueber48.length > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      {ueber48.length > 0 && (
        <div style={{ margin: '12px 0' }}>
          <Hinweis art="warnung">
            Bei {ueber48.length} {ueber48.length === 1 ? 'Person' : 'Personen'} liegt mindestens eine
            Kalenderwoche über 48 Stunden. § 3 ArbZG erlaubt das im Ausgleichszeitraum – ob der
            Ausgleich stimmt, prüft dieses System nicht.
          </Hinweis>
        </div>
      )}

      <Karte>
        {liste.length === 0 ? (
          <Leer>In diesem Monat wurde noch keine Zeit erfasst.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Mitarbeiter</th><th>Personalnr.</th><th>Einsatztage</th>
                  <th style={{ textAlign: 'right' }}>Stunden</th>
                  <th style={{ textAlign: 'right' }}>davon offen</th>
                  <th>Wochen über 48 h</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((zeile) => {
                  const lange = [...zeile.wochen.entries()].filter(([, m]) => m > 48 * 60);
                  return (
                    <tr key={zeile.id} className={lange.length > 0 ? 'zeile-gelb' : undefined}>
                      <td>
                        <Link href={`/mitarbeiter/${zeile.id}/arbeitszeiten`} style={{ fontWeight: 500 }}>{zeile.name}</Link>
                      </td>
                      <td className="zahl" style={{ color: 'var(--text-3)' }}>{zeile.personalNr}</td>
                      <td className="zahl">{zeile.tage.size}</td>
                      <td className="zahl" style={{ textAlign: 'right', fontWeight: 600 }}>{formatHours(zeile.summe)}</td>
                      <td className="zahl" style={{ textAlign: 'right' }}>
                        {zeile.offen > 0 ? <span className="marke marke-gelb">{formatHours(zeile.offen)}</span> : '–'}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {lange.length === 0 ? '–' : lange.map(([kw, m]) => (
                          <span key={kw} className="marke marke-gelb" style={{ marginRight: 3 }}>
                            KW {kw}: {formatHours(m)}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}
