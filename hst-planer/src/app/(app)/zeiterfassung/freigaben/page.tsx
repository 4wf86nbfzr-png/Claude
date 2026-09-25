import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE, formatHours } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { zeitenFreigebenAktion } from '../actions';

export const metadata: Metadata = { title: 'Freigaben' };
export const dynamic = 'force-dynamic';

/**
 * Freigaben (SecPlan 2, Bereich ZEITERFASSUNG).
 *
 * Alles, was noch auf „offen" steht, nach Mitarbeiter gruppiert. Die
 * Gruppierung ist Absicht: freigegeben wird üblicherweise eine ganze
 * Woche einer Person, nicht eine einzelne Schicht quer durchs Haus.
 */
export default async function Freigaben() {
  await seite('timesheets.approve');

  const offene = await db.timeEntry.findMany({
    where: { deletedAt: null, status: 'OFFEN' },
    select: {
      id: true, date: true, start: true, end: true, breakMinutes: true, minutes: true,
      source: true, note: true,
      employee: { select: { id: true, firstName: true, lastName: true, personnelNo: true } },
      event: { select: { id: true, name: true } },
      position: { select: { title: true } },
    },
    orderBy: [{ employee: { lastName: 'asc' } }, { date: 'asc' }],
    take: 400,
  });

  const nachPerson = new Map<string, typeof offene>();
  for (const eintrag of offene) {
    const liste = nachPerson.get(eintrag.employee.id);
    if (liste) liste.push(eintrag);
    else nachPerson.set(eintrag.employee.id, [eintrag]);
  }

  const summe = offene.reduce((s, e) => s + e.minutes, 0);

  return (
    <>
      <Seitenkopf
        titel="Freigaben"
        unter="Zeiten, die noch niemand bestätigt hat."
        aktionen={<Link href="/zeiterfassung" className="knopf knopf-klein">Alle Zeiten</Link>}
      />

      <Raster min={160}>
        <Kennzahl wert={offene.length} label="Offene Einträge" farbe={offene.length > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={nachPerson.size} label="Betroffene Mitarbeiter" />
        <Kennzahl wert={formatHours(summe)} label="Stunden in Prüfung" />
      </Raster>

      {offene.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <Karte><Leer>Es liegt nichts zur Freigabe vor.</Leer></Karte>
        </div>
      ) : (
        <>
          <div style={{ margin: '12px 0' }}>
            <Hinweis art="info">
              Eine Freigabe ist eine Bestätigung, keine Änderung. Wer eine Zeit korrigieren muss,
              tut das unter <Link href="/zeiterfassung/korrekturen">Korrekturen</Link> – dort bleibt
              der alte Wert im Protokoll stehen.
            </Hinweis>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[...nachPerson.entries()].map(([personId, eintraege]) => {
              const person = eintraege[0]!.employee;
              const personSumme = eintraege.reduce((s, e) => s + e.minutes, 0);
              return (
                <Karte
                  key={personId}
                  titel={
                    <span>
                      <Link href={`/mitarbeiter/${personId}/arbeitszeiten`} style={{ fontWeight: 600 }}>
                        {person.lastName}, {person.firstName}
                      </Link>
                      <span style={{ fontWeight: 400, color: 'var(--text-2)', marginLeft: 8 }}>
                        {eintraege.length} {eintraege.length === 1 ? 'Eintrag' : 'Einträge'} · {formatHours(personSumme)}
                      </span>
                    </span>
                  }
                >
                  <AktionsFormular aktion={zeitenFreigebenAktion} meldungOben={false}>
                    <div className="tabelle-scroll">
                      <table className="tabelle">
                        <thead>
                          <tr>
                            <th style={{ width: 28 }} />
                            <th>Datum</th><th>Einsatz</th><th>Position</th>
                            <th>Von</th><th>Bis</th><th>Pause</th><th>Netto</th><th>Quelle</th><th>Notiz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eintraege.map((eintrag) => (
                            <tr key={eintrag.id}>
                              <td>
                                <input type="checkbox" name="auswahl" value={eintrag.id} defaultChecked
                                       aria-label={`Eintrag vom ${formatDateDE(eintrag.date)} freigeben`} />
                              </td>
                              <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(eintrag.date)}</td>
                              <td>{eintrag.event ? <Link href={`/events/${eintrag.event.id}`}>{eintrag.event.name}</Link> : '–'}</td>
                              <td style={{ color: 'var(--text-2)' }}>{eintrag.position?.title ?? '–'}</td>
                              <td className="zahl">{eintrag.start ?? '–'}</td>
                              <td className="zahl">{eintrag.end ?? '–'}</td>
                              <td className="zahl">{eintrag.breakMinutes} min</td>
                              <td className="zahl" style={{ fontWeight: 600 }}>{formatHours(eintrag.minutes)}</td>
                              <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{eintrag.source.toLowerCase()}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{eintrag.note ?? '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="karte-fuss">
                      <AktionsKnopf klasse="knopf knopf-primaer knopf-klein" laufend="Wird freigegeben …">
                        Ausgewählte freigeben
                      </AktionsKnopf>
                    </div>
                  </AktionsFormular>
                </Karte>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
