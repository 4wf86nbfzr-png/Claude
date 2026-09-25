import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'Interne Kommunikation' };
export const dynamic = 'force-dynamic';

/**
 * Interne Kommunikation (SecPlan 2, Bereich KOMMUNIKATION).
 *
 * Was im Haus bleibt: Hinweise in der Mitarbeiter-App und interne
 * Nachrichten. Bewusst getrennt vom E-Mail-Ausgang, weil hier nichts
 * das Haus verlässt und deshalb andere Fristen gelten.
 */
export default async function InterneKommunikation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('communication.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 40);

  const eigene = !can(user.role, 'employees.view');

  const [nachrichten, gesamt, hinweise, ungelesen] = await Promise.all([
    db.message.findMany({
      where: { channel: 'INTERN', ...(eigene ? { employeeId: user.employeeId ?? '__keiner__' } : {}) },
      orderBy: { createdAt: 'desc' },
      skip, take: perPage,
    }),
    db.message.count({ where: { channel: 'INTERN', ...(eigene ? { employeeId: user.employeeId ?? '__keiner__' } : {}) } }),
    db.notification.findMany({
      where: eigene ? { userId: user.id } : {},
      select: {
        id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    db.notification.count({ where: { readAt: null, ...(eigene ? { userId: user.id } : {}) } }),
  ]);

  const mitarbeiterIds = [...new Set(nachrichten.map((n) => n.employeeId).filter((x): x is string => Boolean(x)))];
  const personen = mitarbeiterIds.length > 0
    ? await db.employee.findMany({ where: { id: { in: mitarbeiterIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const personVon = new Map(personen.map((p) => [p.id, p]));

  return (
    <>
      <Seitenkopf
        titel="Interne Kommunikation"
        unter={eigene ? 'Ihre eigenen Hinweise und Nachrichten' : 'Hinweise und Nachrichten innerhalb des Hauses'}
        aktionen={<Link href="/kommunikation" className="knopf knopf-klein">Nachricht senden</Link>}
      />

      <Raster min={160}>
        <Kennzahl wert={gesamt} label="Interne Nachrichten" />
        <Kennzahl wert={hinweise.length} label="Hinweise (zuletzt)" />
        <Kennzahl wert={ungelesen} label="Ungelesen" farbe={ungelesen > 0 ? 'gelb' : 'gruen'}
                  href="/benachrichtigungen" />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          Diese Einträge verlassen das Haus nicht. Sie werden trotzdem nach den Fristen im
          Löschkonzept entfernt – ein internes Protokoll ist kein Archiv auf Dauer.
        </Hinweis>
      </div>

      <Karte titel="Hinweise in der Mitarbeiter-App">
        {hinweise.length === 0 ? <Leer>Keine Hinweise.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Zeitpunkt</th>{!eigene && <th>Empfänger</th>}<th>Anlass</th><th>Text</th><th>Gelesen</th></tr></thead>
              <tbody>
                {hinweise.map((h) => (
                  <tr key={h.id} className={h.readAt ? undefined : 'zeile-blau'}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(h.createdAt)}</td>
                    {!eigene && <td style={{ fontSize: 12 }}>{h.user.name}</td>}
                    <td style={{ fontSize: 11 }}>
                      <span className="marke marke-grau">{h.kind.toLowerCase().replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      {h.link ? <Link href={h.link}>{h.title}</Link> : h.title}
                      {h.body && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{h.body}</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {h.readAt
                        ? <span className="marke marke-gruen">{formatDateDE(h.readAt)}</span>
                        : <span className="marke marke-gelb">ungelesen</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <div style={{ marginTop: 14 }}>
        <Karte titel="Interne Nachrichten">
          {nachrichten.length === 0 ? <Leer>Es wurde noch keine interne Nachricht erfasst.</Leer> : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead><tr><th>Zeitpunkt</th><th>Bezug</th><th>Betreff</th><th>Inhalt</th></tr></thead>
                <tbody>
                  {nachrichten.map((n) => {
                    const person = n.employeeId ? personVon.get(n.employeeId) : null;
                    return (
                      <tr key={n.id}>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(n.createdAt)}</td>
                        <td style={{ fontSize: 12 }}>
                          {person
                            ? <Link href={`/mitarbeiter/${person.id}/kommunikation`}>{person.lastName}, {person.firstName}</Link>
                            : n.eventId ? <Link href={`/events/${n.eventId}`}>Einsatz</Link> : '–'}
                        </td>
                        <td>{n.subject ?? '–'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 460 }}>
                          {n.body.length > 220 ? `${n.body.slice(0, 220)} …` : n.body}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
        </Karte>
      </div>
    </>
  );
}
