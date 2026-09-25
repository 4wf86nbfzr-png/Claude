import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter, darfInterneNotizenSehen } from '@/lib/queries/scope';
import { besetzungAus } from '@/lib/queries/coverage';
import { formatDateDE, formatHours } from '@/lib/time';
import { INCIDENT_KIND, INCIDENT_STATUS, PRIORITY, label } from '@/lib/status';
import { Karte, Leer, Paar, Raster, StatusMarke, Balken } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { vorfallAnlegenAktion, vorfallStatusAktion, eventStornierenAktion, eventDuplizierenAktion, serieAnlegenAktion } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EventUebersicht({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('events.view');
  const { id } = await params;

  const event = await db.event.findFirst({
    where: { id, ...eventFilter(user) },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      operationLead: { select: { id: true, firstName: true, lastName: true, mobile: true } },
      positions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          serviceType: { select: { name: true } },
          assignments: { where: { deletedAt: null }, include: { employee: { select: { id: true, firstName: true, lastName: true, mobile: true } } } },
        },
      },
      incidents: { orderBy: { occurredAt: 'desc' }, include: { employee: { select: { firstName: true, lastName: true } } } },
      _count: { select: { documents: { where: { deletedAt: null } }, timeEntries: { where: { deletedAt: null } } } },
    },
  });
  if (!event) notFound();

  const b = besetzungAus(event.positions);
  const intern = darfInterneNotizenSehen(user);
  const darfPlanen = can(user.role, 'dispo.edit');
  const geplanteMinuten = event.positions.reduce((summe, position) => {
    const aktive = position.assignments.filter((a) => !a.isReserve && !['ABGESAGT', 'STORNIERT'].includes(a.status));
    const dauer = position.startTime && position.endTime
      ? (Number(position.endTime.slice(0, 2)) * 60 + Number(position.endTime.slice(3)) - Number(position.startTime.slice(0, 2)) * 60 - Number(position.startTime.slice(3)) + 1440) % 1440 - position.breakMinutes
      : 0;
    return summe + aktive.length * Math.max(0, dauer);
  }, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, alignItems: 'start' }} className="dashboard-raster">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Karte titel="Positionen" aktion={<Link href={`/events/${id}/positionen`} style={{ fontSize: 12, color: 'var(--text-2)' }}>Bearbeiten</Link>}>
          {event.positions.length === 0 ? (
            <Leer>Es sind noch keine Positionen angelegt. Ohne Positionen kann kein Personal eingeplant werden.</Leer>
          ) : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead><tr><th>Position</th><th>Zeit</th><th>Soll</th><th>Besetzt</th><th>Offen</th><th>Mitarbeiter</th></tr></thead>
                <tbody>
                  {event.positions.map((position) => {
                    const aktive = position.assignments.filter((a) => !a.isReserve && ['EINGETEILT', 'ZUGESAGT', 'ANGEFRAGT', 'ERSCHIENEN'].includes(a.status));
                    const offen = Math.max(0, position.requiredCount - aktive.length);
                    return (
                      <tr key={position.id} className={offen > 0 ? 'zeile-gelb' : 'zeile-gruen'}>
                        <td>
                          <strong style={{ fontWeight: 500 }}>{position.title}</strong>
                          {position.serviceType && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{position.serviceType.name}</span>}
                        </td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{position.startTime ?? event.startTime ?? '–'}–{position.endTime ?? event.endTime ?? '–'}</td>
                        <td className="zahl">{position.requiredCount}</td>
                        <td className="zahl">{aktive.length}</td>
                        <td className="zahl" style={{ color: offen > 0 ? 'var(--gelb)' : 'var(--text-3)', fontWeight: offen > 0 ? 600 : 400 }}>{offen}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {aktive.length === 0 ? '–' : aktive.map((a) => `${a.employee.firstName} ${a.employee.lastName}`).join(', ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Karte>

        <Karte titel="Vorgaben für den Einsatz">
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Raster min={190}>
              <Paar label="Treffpunkt">{event.meetingPoint ?? '–'}</Paar>
              <Paar label="Treffzeit">{event.meetingTime ?? '–'}</Paar>
              <Paar label="Aufbau ab">{event.buildUpTime ?? '–'}</Paar>
              <Paar label="Abbau ab">{event.teardownTime ?? '–'}</Paar>
              <Paar label="Veranstaltungsart">{event.eventKind ?? '–'}</Paar>
              <Paar label="Geplante Stunden">{formatHours(geplanteMinuten)}</Paar>
            </Raster>
            <Paar label="Dresscode">{event.dressCode ?? '–'}</Paar>
            {event.tasks && <Paar label="Aufgaben"><span style={{ whiteSpace: 'pre-wrap' }}>{event.tasks}</span></Paar>}
            {event.hints && <Paar label="Hinweise für Mitarbeiter"><span style={{ whiteSpace: 'pre-wrap' }}>{event.hints}</span></Paar>}
            {intern && event.notesInternal && (
              <div style={{ background: 'var(--gelb-flaeche)', border: '1px solid var(--gelb)33', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                <Paar label="Interne Notiz – nicht für Mitarbeiter"><span style={{ whiteSpace: 'pre-wrap' }}>{event.notesInternal}</span></Paar>
              </div>
            )}
          </div>
        </Karte>

        <Karte titel="Probleme & Vorfälle">
          {event.incidents.length === 0 ? <Leer>Keine Vorfälle erfasst.</Leer> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {event.incidents.map((vorfall) => (
                <li key={vorfall.id} style={{ padding: '11px 14px', borderBottom: '1px solid var(--linie)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>{INCIDENT_KIND[vorfall.kind] ?? vorfall.kind}</strong>
                    <StatusMarke status={label(INCIDENT_STATUS, vorfall.status)} />
                    <StatusMarke status={label(PRIORITY, vorfall.priority)} />
                    <span className="zahl" style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDateDE(vorfall.occurredAt)}</span>
                  </div>
                  {vorfall.employee && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{vorfall.employee.firstName} {vorfall.employee.lastName}</div>}
                  <p style={{ fontSize: 13, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{vorfall.description}</p>
                  {vorfall.resolution && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0' }}>Loesung: {vorfall.resolution}</p>}
                  {vorfall.status !== 'GELOEST' && (
                    <AktionsFormular aktion={vorfallStatusAktion} stil={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input type="hidden" name="eventId" value={id} />
                      <input type="hidden" name="incidentId" value={vorfall.id} />
                      <input name="lösung" className="feld" placeholder="Lösung / Kommentar" style={{ width: 'auto', flex: '1 1 200px' }} />
                      <select name="status" className="feld" defaultValue="GELOEST" style={{ width: 'auto' }}>
                        <option value="IN_BEARBEITUNG">In Bearbeitung</option>
                        <option value="GELOEST">Gelöst</option>
                        <option value="VERWORFEN">Verworfen</option>
                      </select>
                      <AktionsKnopf klasse="knopf knopf-klein">Speichern</AktionsKnopf>
                    </AktionsFormular>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div style={{ padding: 14 }}>
            <Ausklapp titel="+ Vorfall erfassen" knopfKlasse="knopf knopf-klein">
              <AktionsFormular aktion={vorfallAnlegenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
                <input type="hidden" name="eventId" value={id} />
                <Raster min={150}>
                  <select name="kind" className="feld" aria-label="Art des Vorfalls">
                    {Object.entries(INCIDENT_KIND).map(([wert, text]) => <option key={wert} value={wert}>{text}</option>)}
                  </select>
                  <select name="priority" className="feld" aria-label="Priorität" defaultValue="NORMAL">
                    {Object.entries(PRIORITY).map(([wert, s]) => <option key={wert} value={wert}>{s.label}</option>)}
                  </select>
                  <select name="employeeId" className="feld" aria-label="Betroffener Mitarbeiter" defaultValue="">
                    <option value="">– kein Mitarbeiter –</option>
                    {event.positions.flatMap((p) => p.assignments).map((a) => (
                      <option key={a.id} value={a.employeeId}>{a.employee.firstName} {a.employee.lastName}</option>
                    ))}
                  </select>
                </Raster>
                <textarea name="description" className="feld" rows={3} required placeholder="Was ist passiert?" />
                <div><AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Vorfall speichern</AktionsKnopf></div>
              </AktionsFormular>
            </Ausklapp>
          </div>
        </Karte>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Karte titel="Auf einen Blick">
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Paar label="Besetzung"><Balken ist={b.ist} soll={b.soll} /></Paar>
            <Paar label="Zugesagt">{b.bestaetigt} von {b.soll}</Paar>
            <Paar label="Offene Positionen">{b.offen}</Paar>
            <Paar label="Einsatzleitung">
              {event.operationLead
                ? <Link href={`/mitarbeiter/${event.operationLead.id}`}>{event.operationLead.firstName} {event.operationLead.lastName}</Link>
                : 'noch offen'}
            </Paar>
            <Paar label="Dokumente"><Link href={`/events/${id}/dokumente`}>{event._count.documents}</Link></Paar>
            <Paar label="Erfasste Zeiten"><Link href={`/events/${id}/zeiten`}>{event._count.timeEntries}</Link></Paar>
          </div>
        </Karte>

        <Karte titel="Kontakt beim Kunden">
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Paar label="Kunde">{event.customer ? <Link href={`/kunden/${event.customer.id}`}>{event.customer.name}</Link> : '–'}</Paar>
            <Paar label="Ansprechpartner">{event.contactName ?? '–'}</Paar>
            <Paar label="Telefon">{event.contactPhone ? <a href={`tel:${event.contactPhone.replace(/\s/g, '')}`}>{event.contactPhone}</a> : '–'}</Paar>
            <Paar label="E-Mail">{event.contactEmail ? <a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a> : '–'}</Paar>
          </div>
        </Karte>

        {darfPlanen && (
          <Karte titel="Aktionen">
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Ausklapp titel="Event duplizieren" knopfKlasse="knopf knopf-klein">
                <AktionsFormular aktion={eventDuplizierenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="hidden" name="id" value={id} />
                  <label className="feld-label" htmlFor="dup-datum">Neues Datum</label>
                  <input id="dup-datum" name="datum" type="date" className="feld" required defaultValue={event.date.toISOString().slice(0, 10)} />
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" name="mitZuweisungen" /> Zuweisungen als Vorschlag übernehmen
                  </label>
                  <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Duplizieren</AktionsKnopf>
                </AktionsFormular>
              </Ausklapp>

              <Ausklapp titel="Serie anlegen" knopfKlasse="knopf knopf-klein">
                <AktionsFormular aktion={serieAnlegenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="hidden" name="id" value={id} />
                  <select name="rhythmus" className="feld" aria-label="Rhythmus" defaultValue="WOECHENTLICH">
                    <option value="TAEGLICH">täglich</option>
                    <option value="WOECHENTLICH">wöchentlich</option>
                    <option value="ZWEIWOECHENTLICH">alle zwei Wochen</option>
                    <option value="MONATLICH">monatlich</option>
                  </select>
                  <input name="anzahl" type="number" min={1} max={52} defaultValue={4} className="feld zahl" aria-label="Anzahl Folgetermine" />
                  <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" name="mitZuweisungen" /> Zuweisungen übernehmen
                  </label>
                  <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Folgetermine erzeugen</AktionsKnopf>
                </AktionsFormular>
              </Ausklapp>

              {event.status !== 'STORNIERT' && (
                <Ausklapp titel="Event stornieren" knopfKlasse="knopf knopf-klein knopf-gefahr">
                  <AktionsFormular aktion={eventStornierenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="hidden" name="id" value={id} />
                    <textarea name="grund" className="feld" rows={2} required placeholder="Grund der Stornierung (geht an alle eingeteilten Kräfte)" />
                    <AktionsKnopf klasse="knopf knopf-gefahr knopf-klein" laufend="Wird storniert …">Endgültig stornieren</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              )}
            </div>
          </Karte>
        )}
      </div>
    </div>
  );
}
