import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { employeeFilter, eventFilter } from '@/lib/queries/scope';
import { formatDateDE, toDateOnly } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Teamleiter' };
export const dynamic = 'force-dynamic';

/**
 * Teamleiter (SecPlan 2, Bereich EINSÄTZE).
 *
 * Wer führt vor Ort? Die Seite zieht das aus zwei Quellen zusammen: aus
 * der Einsatzleitung am Event und aus der Funktion in der Zuordnung.
 * Dazu steht, was eine Teamleitung im System sehen darf – das ist der
 * häufigste Rückfragepunkt, wenn jemand neu in die Rolle kommt.
 */
export default async function Teamleiter() {
  const user = await seite('events.view');
  const heute = toDateOnly(new Date());
  const vor90Tagen = new Date(heute.getTime() - 90 * 86400000);

  const [fuehrungen, leitungen] = await Promise.all([
    db.assignment.findMany({
      where: {
        deletedAt: null,
        roleInTeam: { in: ['TEAMLEITUNG', 'EINSATZLEITUNG'] },
        event: { ...eventFilter(user), date: { gte: vor90Tagen } },
      },
      select: {
        id: true, roleInTeam: true,
        employee: { select: { id: true, firstName: true, lastName: true, mobile: true } },
        event: { select: { id: true, name: true, date: true } },
      },
      orderBy: { event: { date: 'desc' } },
    }),
    db.event.findMany({
      where: { ...eventFilter(user), date: { gte: vor90Tagen }, operationLeadId: { not: null } },
      select: {
        id: true, name: true, date: true,
        operationLead: { select: { id: true, firstName: true, lastName: true, mobile: true } },
      },
      orderBy: { date: 'desc' },
    }),
  ]);

  interface Leiter {
    id: string; name: string; mobile: string | null;
    einsaetze: number; kommend: number;
    naechster: { id: string; name: string; date: Date } | null;
  }
  const leiter = new Map<string, Leiter>();

  function zaehle(person: { id: string; firstName: string; lastName: string; mobile: string | null }, event: { id: string; name: string; date: Date }) {
    const vorhanden = leiter.get(person.id) ?? {
      id: person.id, name: `${person.lastName}, ${person.firstName}`, mobile: person.mobile,
      einsaetze: 0, kommend: 0, naechster: null,
    };
    vorhanden.einsaetze += 1;
    if (event.date >= heute) {
      vorhanden.kommend += 1;
      if (!vorhanden.naechster || event.date < vorhanden.naechster.date) vorhanden.naechster = event;
    }
    leiter.set(person.id, vorhanden);
  }

  for (const f of fuehrungen) zaehle(f.employee, f.event);
  for (const l of leitungen) if (l.operationLead) zaehle(l.operationLead, l);

  const liste = [...leiter.values()].sort((a, b) => b.einsaetze - a.einsaetze);

  // Wer hat einen Zugang mit der Rolle TEAMLEITUNG?
  const mitZugang = await db.user.findMany({
    where: { role: 'TEAMLEITUNG', deletedAt: null, employee: employeeFilter(user) },
    select: { id: true, name: true, active: true, lastLoginAt: true, employeeId: true },
  });
  const zugangVon = new Map(mitZugang.map((u) => [u.employeeId!, u]));

  return (
    <>
      <Seitenkopf titel="Teamleiter" unter="Führung vor Ort – aus Einsatzleitung und Funktion in der Zuordnung, letzte 90 Tage." />

      <Raster min={160}>
        <Kennzahl wert={liste.length} label="Personen mit Führungsfunktion" />
        <Kennzahl wert={liste.filter((l) => l.kommend > 0).length} label="Davon künftig eingeteilt" />
        <Kennzahl wert={mitZugang.length} label="Zugänge mit Rolle Teamleitung" />
        <Kennzahl wert={liste.filter((l) => !zugangVon.has(l.id)).length} label="Führen ohne eigenen Zugang"
                  hinweis="sehen keinen Einsatzplan im System"
                  farbe={liste.some((l) => !zugangVon.has(l.id)) ? 'gelb' : 'gruen'} />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          <strong>Was eine Teamleitung sieht:</strong> zum eigenen Einsatz Name, Funktion,
          Einsatzzeit, Einsatzort und die nötige Qualifikation. Nicht: Bankdaten, vollständige
          Personalakte, private Anschrift, Arbeitsvertrag, Gesundheitsdaten oder interne
          Personalnotizen. Das ist im Rechtekonzept so festgelegt und lässt sich nicht je Person
          aufweichen.
        </Hinweis>
      </div>

      <Karte>
        {liste.length === 0 ? (
          <Leer>In den letzten 90 Tagen war keine Führungsfunktion besetzt.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Name</th><th>Mobil</th><th>Führungen (90 T)</th><th>Kommend</th><th>Nächster Einsatz</th><th>Zugang</th><th>Zuletzt angemeldet</th></tr>
              </thead>
              <tbody>
                {liste.map((l) => {
                  const zugang = zugangVon.get(l.id);
                  return (
                    <tr key={l.id} className={!zugang ? 'zeile-gelb' : undefined}>
                      <td><Link href={`/mitarbeiter/${l.id}`} style={{ fontWeight: 500 }}>{l.name}</Link></td>
                      <td style={{ fontSize: 12 }}>
                        {l.mobile ? <a href={`tel:${l.mobile.replace(/\s/g, '')}`}>{l.mobile}</a> : '–'}
                      </td>
                      <td className="zahl">{l.einsaetze}</td>
                      <td className="zahl">{l.kommend}</td>
                      <td style={{ fontSize: 12 }}>
                        {l.naechster
                          ? <Link href={`/events/${l.naechster.id}`}>{formatDateDE(l.naechster.date)} · {l.naechster.name}</Link>
                          : <span style={{ color: 'var(--text-3)' }}>–</span>}
                      </td>
                      <td>
                        {zugang
                          ? <span className={`marke marke-${zugang.active ? 'gruen' : 'grau'}`}>{zugang.active ? 'aktiv' : 'gesperrt'}</span>
                          : <span className="marke marke-gelb">kein Zugang</span>}
                      </td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {zugang?.lastLoginAt ? formatDateDE(zugang.lastLoginAt) : '–'}
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
