import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Schulungen' };
export const dynamic = 'force-dynamic';

/**
 * Schulungen (SecPlan 2, Bereich PERSONAL).
 *
 * Unterschied zur Qualifikation: die Qualifikation ist der Nachweis, die
 * Schulung der Termin. Pflichtschulungen mit Wiederholung laufen ab –
 * und genau das prüft die Disposition beim Zuordnen mit.
 */
export default async function Schulungen() {
  await seite('trainings.view');

  const jetzt = new Date();

  const [schulungen, aktive] = await Promise.all([
    db.training.findMany({
      where: { deletedAt: null },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true, title: true, description: true, startsAt: true, endsAt: true,
        location: true, seats: true, mandatory: true, repeatMonths: true,
        participants: {
          select: { id: true, employeeId: true, result: true },
        },
      },
      take: 60,
    }),
    db.employee.count({ where: { deletedAt: null, active: true } }),
  ]);

  const pflicht = schulungen.filter((s) => s.mandatory);
  const kommend = schulungen.filter((s) => s.startsAt > jetzt);

  // Wer hat eine Pflichtschulung offen? Bewusst je Schulung gezaehlt, denn
  // „X Leute ohne Unterweisung" sagt mehr als eine Gesamtquote.
  const namen = new Map<string, { id: string; name: string; fehlt: string[] }>();
  if (pflicht.length > 0) {
    const alle = await db.employee.findMany({
      where: { deletedAt: null, active: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }],
    });
    for (const schulung of pflicht) {
      const bestanden = new Set(
        schulung.participants
          .filter((t) => t.result === 'BESTANDEN' || t.result === 'TEILGENOMMEN')
          .map((t) => t.employeeId),
      );
      for (const person of alle) {
        if (bestanden.has(person.id)) continue;
        const vorhanden = namen.get(person.id) ?? { id: person.id, name: `${person.lastName}, ${person.firstName}`, fehlt: [] };
        vorhanden.fehlt.push(schulung.title);
        namen.set(person.id, vorhanden);
      }
    }
  }
  const offeneUnterweisungen = [...namen.values()];

  return (
    <>
      <Seitenkopf titel="Schulungen" unter="Termine, Teilnahmen und offene Pflichtunterweisungen." />

      <Raster min={160}>
        <Kennzahl wert={schulungen.length} label="Schulungen erfasst" />
        <Kennzahl wert={kommend.length} label="Kommende Termine" farbe={kommend.length > 0 ? 'blau' : 'grau'} />
        <Kennzahl wert={pflicht.length} label="Pflichtschulungen" />
        <Kennzahl wert={offeneUnterweisungen.length} label="Kräfte ohne Pflichtnachweis"
                  hinweis={`von ${aktive} aktiven`}
                  farbe={offeneUnterweisungen.length > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      {offeneUnterweisungen.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Hinweis art="warnung">
            Beim Zuordnen erscheint für diese Kräfte ein Hinweis. Blockiert wird der Einsatz
            nicht – ob eine fehlende Unterweisung ein Ausschlussgrund ist, entscheidet die
            Einsatzleitung, nicht das System.
          </Hinweis>
        </div>
      )}

      <h2 className="abschnitt">Termine</h2>
      <Karte>
        {schulungen.length === 0 ? (
          <Leer>Es ist noch keine Schulung erfasst.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Schulung</th><th>Zeitraum</th><th>Ort</th><th>Art</th><th>Teilnahme</th><th>Plätze</th></tr>
              </thead>
              <tbody>
                {schulungen.map((schulung) => {
                  const bestanden = schulung.participants.filter((t) => t.result === 'BESTANDEN' || t.result === 'TEILGENOMMEN').length;
                  const kuenftig = schulung.startsAt > jetzt;
                  return (
                    <tr key={schulung.id} className={kuenftig ? 'zeile-blau' : undefined}>
                      <td>
                        <span style={{ fontWeight: 500 }}>{schulung.title}</span>
                        {schulung.description && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{schulung.description}</span>
                        )}
                      </td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateDE(schulung.startsAt)}
                        {schulung.endsAt.getTime() !== schulung.startsAt.getTime() && ` – ${formatDateDE(schulung.endsAt)}`}
                      </td>
                      <td style={{ color: 'var(--text-2)' }}>{schulung.location ?? '–'}</td>
                      <td>
                        {schulung.mandatory
                          ? <span className="marke marke-beige">Pflicht{schulung.repeatMonths ? `, alle ${schulung.repeatMonths} Mon.` : ''}</span>
                          : <span className="marke marke-grau">freiwillig</span>}
                      </td>
                      <td className="zahl">{bestanden} von {schulung.participants.length}</td>
                      <td className="zahl">{schulung.seats ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      {offeneUnterweisungen.length > 0 && (
        <>
          <h2 className="abschnitt">Offene Pflichtunterweisungen</h2>
          <Karte>
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead><tr><th>Mitarbeiter</th><th>Fehlt</th></tr></thead>
                <tbody>
                  {offeneUnterweisungen.map((person) => (
                    <tr key={person.id} className="zeile-gelb">
                      <td><Link href={`/mitarbeiter/${person.id}`}>{person.name}</Link></td>
                      <td style={{ fontSize: 12 }}>
                        {person.fehlt.map((titel) => (
                          <span key={titel} className="marke marke-gelb" style={{ marginRight: 4 }}>{titel}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Karte>
        </>
      )}
    </>
  );
}
