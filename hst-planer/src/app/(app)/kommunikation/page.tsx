import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE, toDateOnly } from '@/lib/time';
import { versandKonfiguriert } from '@/lib/email/versand';
import { Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';
import { Blaettern } from '@/components/blaettern';
import { NachrichtFormular } from './formular';

export const metadata: Metadata = { title: 'Kommunikation' };
export const dynamic = 'force-dynamic';

export default async function Kommunikation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('communication.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 30);
  const heute = toDateOnly(new Date());

  const [nachrichten, gesamt, events, mitarbeiter] = await Promise.all([
    db.message.findMany({ orderBy: { createdAt: 'desc' }, skip, take: perPage }),
    db.message.count(),
    db.event.findMany({
      where: { deletedAt: null, date: { gte: new Date(heute.getTime() - 14 * 86400000) }, status: { notIn: ['STORNIERT'] } },
      select: { id: true, name: true, date: true }, orderBy: { date: 'asc' }, take: 60,
    }),
    db.employee.findMany({ where: { deletedAt: null, active: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
  ]);

  const darfSenden = can(user.role, 'communication.send');

  return (
    <>
      <Seitenkopf titel="Kommunikation" unter="Nachrichten an Mitarbeiter und Einsatzteams" />

      {darfSenden && !versandKonfiguriert() && (
        <div style={{ marginBottom: 14 }}>
          <Hinweis art="warnung">
            Der E-Mail-Versand ist noch nicht eingerichtet (SMTP-Zugangsdaten fehlen in der .env).
            Nachrichten werden bis dahin nur im Planer hinterlegt und als Benachrichtigung zugestellt.
          </Hinweis>
        </div>
      )}

      <div className="zweispaltig" style={{ ['--zweite' as string]: '300px' }}>
        {darfSenden && (
          <Karte titel="Nachricht senden">
            <div style={{ padding: 16 }}>
              <NachrichtFormular
                events={events.map((e) => ({ id: e.id, name: `${formatDateDE(e.date)} · ${e.name}` }))}
                mitarbeiter={mitarbeiter.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }))}
              />
            </div>
          </Karte>
        )}

        <Karte titel="Verlauf">
          {nachrichten.length === 0 ? <Leer>Noch keine Nachrichten.</Leer> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {nachrichten.map((nachricht) => (
                <li key={nachricht.id} style={{ padding: '11px 14px', borderBottom: '1px solid var(--linie)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`marke marke-${nachricht.error ? 'rot' : nachricht.sentAt ? 'gruen' : 'gelb'}`}>
                      {nachricht.error ? 'Fehler' : nachricht.sentAt ? 'zugestellt' : 'offen'}
                    </span>
                    <strong style={{ fontSize: 13 }}>{nachricht.subject ?? '(ohne Betreff)'}</strong>
                    <span className="zahl" style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDateDE(nachricht.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {nachricht.channel} an {nachricht.toAddress ?? 'intern'}
                    {nachricht.eventId && <> · <Link href={`/events/${nachricht.eventId}`}>Event</Link></>}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                    {nachricht.body.slice(0, 220)}{nachricht.body.length > 220 ? ' …' : ''}
                  </p>
                  {nachricht.error && <p style={{ fontSize: 12, color: 'var(--rot)', margin: '4px 0 0' }}>{nachricht.error}</p>}
                </li>
              ))}
            </ul>
          )}
          <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
        </Karte>
      </div>
    </>
  );
}
