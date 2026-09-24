import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE, formatHours, minutesToHours, toDateOnly } from '@/lib/time';
import { TIME_ENTRY_STATUS, label } from '@/lib/status';
import { Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { Icon } from '@/components/icons';
import { zeitEntfernenAktion, zeitSpeichernAktion, zeitenFreigebenAktion } from './actions';

export const metadata: Metadata = { title: 'Zeiterfassung' };
export const dynamic = 'force-dynamic';

export default async function Zeiterfassung({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('timesheets.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 50);

  const heute = toDateOnly(new Date());
  const monatsbeginn = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), 1));

  const where: Prisma.TimeEntryWhereInput = { deletedAt: null };
  if (user.scope === 'EIGENE') where.employeeId = user.employeeId ?? '__keiner__';
  if (user.scope === 'PARTNER') where.employee = { partnerId: user.partnerId ?? '__kein_partner__' };
  if (params.status) where.status = params.status as Prisma.TimeEntryWhereInput['status'];
  if (params.mitarbeiter) where.employeeId = params.mitarbeiter;
  if (params.von) where.date = { gte: new Date(`${params.von}T00:00:00Z`) };
  if (params.bis) where.date = { ...(where.date as object ?? {}), lte: new Date(`${params.bis}T00:00:00Z`) };
  if (params.q) {
    where.OR = [
      { employee: { firstName: { contains: params.q, mode: 'insensitive' } } },
      { employee: { lastName: { contains: params.q, mode: 'insensitive' } } },
      { event: { name: { contains: params.q, mode: 'insensitive' } } },
    ];
  }

  const [zeiten, gesamt, summe, offene, mitarbeiter, events] = await Promise.all([
    db.timeEntry.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, personnelNo: true } },
        event: { select: { id: true, name: true } },
        position: { select: { title: true } },
      },
      orderBy: [{ date: 'desc' }, { start: 'asc' }],
      skip, take: perPage,
    }),
    db.timeEntry.count({ where }),
    db.timeEntry.aggregate({ where, _sum: { minutes: true } }),
    db.timeEntry.count({ where: { deletedAt: null, status: 'OFFEN' } }),
    can(user.role, 'employees.view')
      ? db.employee.findMany({ where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } })
      : Promise.resolve([]),
    can(user.role, 'timesheets.edit')
      ? db.event.findMany({ where: { deletedAt: null, date: { gte: new Date(heute.getTime() - 90 * 86400000) } }, select: { id: true, name: true, date: true }, orderBy: { date: 'desc' }, take: 100 })
      : Promise.resolve([]),
  ]);

  const monat = await db.timeEntry.aggregate({
    where: { ...where, date: { gte: monatsbeginn } }, _sum: { minutes: true },
  });

  const darfBearbeiten = can(user.role, 'timesheets.edit');
  const darfFreigeben = can(user.role, 'timesheets.approve');

  return (
    <>
      <Seitenkopf
        titel="Zeiterfassung"
        unter={`${gesamt.toLocaleString('de-DE')} Einträge in der Auswahl`}
        aktionen={
          <>
            <Link href="/api/export/zeiten" className="knopf"><Icon name="download" /> Excel-Export</Link>
            {darfBearbeiten && <Link href="/abgleiche/neu" className="knopf knopf-primaer"><Icon name="upload" /> Stundenzettel importieren</Link>}
          </>
        }
      />

      <Raster min={160}>
        <Kennzahl wert={formatHours(summe._sum.minutes ?? 0)} label="Stunden in der Auswahl" />
        <Kennzahl wert={formatHours(monat._sum.minutes ?? 0)} label="Stunden im laufenden Monat" />
        <Kennzahl wert={offene} label="Noch zu prüfen" farbe={offene > 0 ? 'gelb' : 'gruen'} href="/zeiterfassung?status=OFFEN" />
        <Kennzahl wert={minutesToHours(summe._sum.minutes ?? 0).toLocaleString('de-DE')} label="Dezimalstunden" hinweis="für die Abrechnung" />
      </Raster>

      <div style={{ marginTop: 16 }}>
        <Karte>
          <Filterleiste
            platzhalter="Mitarbeiter oder Event …"
            felder={[
              { name: 'status', label: 'Status', optionen: Object.entries(TIME_ENTRY_STATUS).map(([wert, s]) => ({ wert, label: s.label })) },
              ...(mitarbeiter.length ? [{ name: 'mitarbeiter', label: 'Mitarbeiter', optionen: mitarbeiter.map((m) => ({ wert: m.id, label: `${m.lastName}, ${m.firstName}` })) }] : []),
            ]}
          />

          {zeiten.length === 0 ? <Leer>Keine Zeiteinträge in dieser Auswahl.</Leer> : (
            <AktionsFormular aktion={zeitenFreigebenAktion}>
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead>
                    <tr>
                      {darfFreigeben && <th style={{ width: 1 }}><span className="feld-label">Wahl</span></th>}
                      <th>Datum</th><th>Mitarbeiter</th><th>Event / Position</th><th>Zeit</th>
                      <th>Pause</th><th>Stunden</th><th>Quelle</th><th>Status</th>
                      {darfBearbeiten && <th style={{ width: 1 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {zeiten.map((eintrag) => (
                      <tr key={eintrag.id} className={eintrag.status === 'OFFEN' ? 'zeile-gelb' : eintrag.status === 'FREIGEGEBEN' ? 'zeile-gruen' : undefined}>
                        {darfFreigeben && (
                          <td>
                            <input type="checkbox" name="auswahl" value={eintrag.id}
                                   disabled={eintrag.status === 'ABGERECHNET'} aria-label="Zur Freigabe auswählen" />
                          </td>
                        )}
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(eintrag.date)}</td>
                        <td>
                          <Link href={`/mitarbeiter/${eintrag.employee.id}`}>{eintrag.employee.lastName}, {eintrag.employee.firstName}</Link>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{eintrag.employee.personnelNo}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {eintrag.event ? <Link href={`/events/${eintrag.event.id}`}>{eintrag.event.name}</Link> : <span style={{ color: 'var(--text-gedaempft)' }}>ohne Event</span>}
                          {eintrag.position && <span style={{ display: 'block', color: 'var(--text-gedaempft)', fontSize: 11 }}>{eintrag.position.title}</span>}
                        </td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{eintrag.start}–{eintrag.end}</td>
                        <td className="zahl">{eintrag.breakMinutes} Min</td>
                        <td className="zahl" style={{ fontWeight: 600 }}>{formatHours(eintrag.minutes)}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-sekundaer)' }}>{eintrag.source}</td>
                        <td><StatusMarke status={label(TIME_ENTRY_STATUS, eintrag.status)} /></td>
                        {darfBearbeiten && (
                          <td>
                            <Ausklapp titel="Bearbeiten" knopfKlasse="knopf knopf-klein">
                              <ZeitFormular eintrag={eintrag} mitarbeiter={mitarbeiter} events={events} />
                            </Ausklapp>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {darfFreigeben && (
                <div style={{ padding: 12, borderTop: '1px solid var(--linie)' }}>
                  <AktionsKnopf klasse="knopf knopf-primaer">Ausgewählte Zeiten freigeben</AktionsKnopf>
                </div>
              )}
            </AktionsFormular>
          )}

          <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
        </Karte>
      </div>

      {darfBearbeiten && (
        <div style={{ marginTop: 16 }}>
          <Karte titel="Zeit von Hand erfassen">
            <div style={{ padding: 14 }}>
              <ZeitFormular mitarbeiter={mitarbeiter} events={events} neu />
            </div>
          </Karte>
        </div>
      )}
    </>
  );
}

interface ZeitEintrag {
  id: string; employeeId: string; eventId: string | null; positionId: string | null;
  date: Date; start: string; end: string; breakMinutes: number; note: string | null;
}

function ZeitFormular({
  eintrag, mitarbeiter, events, neu,
}: {
  eintrag?: ZeitEintrag;
  mitarbeiter: Array<{ id: string; firstName: string; lastName: string }>;
  events: Array<{ id: string; name: string; date: Date }>;
  neu?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
      <AktionsFormular aktion={zeitSpeichernAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {eintrag && <input type="hidden" name="id" value={eintrag.id} />}
        <label className="feld-gruppe" style={{ flex: '1 1 180px' }}>
          <span className="feld-label">Mitarbeiter</span>
          <select name="employeeId" className="feld" required defaultValue={eintrag?.employeeId ?? ''}>
            <option value="">– wählen –</option>
            {mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.lastName}, {m.firstName}</option>)}
          </select>
        </label>
        <label className="feld-gruppe" style={{ flex: '1 1 180px' }}>
          <span className="feld-label">Event</span>
          <select name="eventId" className="feld" defaultValue={eintrag?.eventId ?? ''}>
            <option value="">– ohne Event –</option>
            {events.map((e) => <option key={e.id} value={e.id}>{formatDateDE(e.date)} · {e.name}</option>)}
          </select>
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Datum</span>
          <input name="date" type="date" className="feld" required style={{ width: 'auto' }}
                 defaultValue={eintrag ? eintrag.date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Beginn</span>
          <input name="start" type="time" className="feld" required style={{ width: 'auto' }} defaultValue={eintrag?.start ?? ''} />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Ende</span>
          <input name="end" type="time" className="feld" required style={{ width: 'auto' }} defaultValue={eintrag?.end ?? ''} />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Pause</span>
          <input name="breakMinutes" type="number" min={0} max={600} className="feld zahl" style={{ width: 80 }} defaultValue={eintrag?.breakMinutes ?? 0} />
        </label>
        <label className="feld-gruppe" style={{ flex: '1 1 160px' }}>
          <span className="feld-label">Notiz</span>
          <input name="note" className="feld" defaultValue={eintrag?.note ?? ''} />
        </label>
        <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">{neu ? 'Erfassen' : 'Speichern'}</AktionsKnopf>
      </AktionsFormular>

      {eintrag && (
        <AktionsFormular aktion={zeitEntfernenAktion} stil={{ display: 'flex', gap: 6 }} meldungOben={false}>
          <input type="hidden" name="id" value={eintrag.id} />
          <input name="grund" className="feld" placeholder="Grund" style={{ flex: 1 }} />
          <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr">Entfernen</AktionsKnopf>
        </AktionsFormular>
      )}
    </div>
  );
}
