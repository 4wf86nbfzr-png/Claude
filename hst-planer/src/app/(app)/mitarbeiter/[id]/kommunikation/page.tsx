import Link from 'next/link';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Leer } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kommunikation' };

const KANAL: Record<string, string> = {
  EMAIL: 'E-Mail', SMS: 'SMS', WHATSAPP: 'WhatsApp', INTERN: 'Intern', PUSH: 'Push',
};

/**
 * Reiter „Kommunikation" der Mitarbeiterakte (SecPlan 5).
 *
 * Was an diese Person ging und was von ihr kam – Anlass, Kanal, Zeitpunkt.
 * Der Inhalt steht mit, denn ohne ihn ist die Zeile wertlos; deshalb hängt
 * der Reiter am Recht `communication.view` und nicht an `employees.view`.
 */
export default async function AkteKommunikation({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('communication.view');
  const { id } = await params;

  const sichtbar = await db.employee.count({ where: { id, ...employeeFilter(user) } });
  if (sichtbar === 0) return <Karte><Leer>Dieser Datensatz ist für Ihre Rolle nicht sichtbar.</Leer></Karte>;

  const [nachrichten, benachrichtigungen] = await Promise.all([
    db.message.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    can(user.role, 'employees.file')
      ? db.notification.findMany({
          where: { user: { employeeId: id } },
          select: { id: true, kind: true, title: true, body: true, readAt: true, createdAt: true, link: true },
          orderBy: { createdAt: 'desc' },
          take: 40,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Hinweis art="info">
        Der Verlauf ist ein Nachweis, kein Postfach. Gelöscht wird er nach der Frist im
        Löschkonzept – nicht von Hand.
      </Hinweis>

      <Karte titel={`Nachrichten (${nachrichten.length})`}>
        {nachrichten.length === 0 ? <Leer>Es wurde noch nichts versendet oder empfangen.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Zeitpunkt</th><th>Richtung</th><th>Kanal</th><th>Betreff</th><th>Inhalt</th><th>Zustellung</th></tr>
              </thead>
              <tbody>
                {nachrichten.map((nachricht) => (
                  <tr key={nachricht.id} className={nachricht.error ? 'zeile-rot' : undefined}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(nachricht.createdAt)}</td>
                    <td>
                      <span className={`marke marke-${nachricht.direction === 'EIN' ? 'blau' : 'grau'}`}>
                        {nachricht.direction === 'EIN' ? 'eingegangen' : 'gesendet'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{KANAL[nachricht.channel] ?? nachricht.channel}</td>
                    <td>{nachricht.subject ?? '–'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 380 }}>
                      {nachricht.body.length > 180 ? `${nachricht.body.slice(0, 180)} …` : nachricht.body}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {nachricht.error
                        ? <span className="marke marke-rot" title={nachricht.error}>fehlgeschlagen</span>
                        : nachricht.sentAt
                          ? <span className="marke marke-gruen">{formatDateDE(nachricht.sentAt)}</span>
                          : <span className="marke marke-gelb">nicht versendet</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      {benachrichtigungen.length > 0 && (
        <Karte titel="Hinweise in der Mitarbeiter-App">
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Zeitpunkt</th><th>Anlass</th><th>Text</th><th>Gelesen</th></tr></thead>
              <tbody>
                {benachrichtigungen.map((n) => (
                  <tr key={n.id}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(n.createdAt)}</td>
                    <td style={{ fontSize: 11 }}><span className="marke marke-grau">{n.kind.toLowerCase().replace(/_/g, ' ')}</span></td>
                    <td>
                      {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}
                      {n.body && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{n.body}</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {n.readAt
                        ? <span className="marke marke-gruen">{formatDateDE(n.readAt)}</span>
                        : <span className="marke marke-gelb">ungelesen</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Karte>
      )}
    </div>
  );
}
