import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { personalVorschlaege } from '@/lib/queries/personalsuche';
import { EMPLOYMENT_TYPE, ASSIGNMENT_STATUS, label } from '@/lib/status';
import { Karte, Leer, StatusMarke } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { zuweisenAktion, zuweisungEntfernenAktion, zuweisungStatusAktion } from '../../actions';

export const metadata = { title: 'Mitarbeiter' };
export const dynamic = 'force-dynamic';

export default async function EventMitarbeiter({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('events.view');
  const { id } = await params;
  const such = await searchParams;
  const darfPlanen = can(user.role, 'dispo.edit');

  const event = await db.event.findFirst({
    where: { id, ...eventFilter(user) },
    include: {
      positions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          requirements: { include: { qualification: { select: { name: true } } } },
          assignments: {
            where: { deletedAt: null },
            orderBy: [{ isReserve: 'asc' }, { createdAt: 'asc' }],
            include: { employee: { select: { id: true, firstName: true, lastName: true, mobile: true, personnelNo: true } }, partner: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!event) notFound();

  // Personal-Suche nur für die aktuell geoeffnete Position laden – so bleibt
  // die Seite auch bei vielen Positionen schnell.
  const offenePosition = such.position ?? null;
  const vorschlaege = darfPlanen && offenePosition
    ? await personalVorschlaege(offenePosition, {
        q: such.q, nurVerfuegbar: such.verfuegbar === 'ja',
        qualifikationId: such.qualifikation, beschaeftigung: such.beschaeftigung,
      })
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {event.positions.length === 0 && <Karte><Leer>Legen Sie zuerst Positionen an.</Leer></Karte>}

      {event.positions.map((position) => {
        const aktive = position.assignments.filter((a) => !a.isReserve && !['ABGESAGT', 'STORNIERT'].includes(a.status));
        const ersatz = position.assignments.filter((a) => a.isReserve);
        const offen = Math.max(0, position.requiredCount - aktive.length);
        const geoeffnet = offenePosition === position.id;

        return (
          <Karte key={position.id}
                 titel={
                   <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                     <span>{position.title}</span>
                     <span style={{ fontWeight: 400, color: 'var(--text-sekundaer)', fontSize: 12 }}>
                       {position.startTime ?? event.startTime ?? '–'}–{position.endTime ?? event.endTime ?? '–'} · Pause {position.breakMinutes} Min
                     </span>
                     <span className={`marke marke-${offen > 0 ? 'gelb' : 'gruen'}`}>{aktive.length}/{position.requiredCount}</span>
                     {position.requirements.length > 0 && (
                       <span className="marke marke-grau">{position.requirements.map((r) => r.qualification.name).join(', ')}</span>
                     )}
                   </span>
                 }
                 aktion={darfPlanen && (
                   <Link className="knopf knopf-klein knopf-primaer"
                         href={geoeffnet ? `/events/${id}/mitarbeiter` : `/events/${id}/mitarbeiter?position=${position.id}`}
                         scroll={false}>
                     {geoeffnet ? 'Suche schließen' : `Personal suchen${offen > 0 ? ` (${offen} offen)` : ''}`}
                   </Link>
                 )}>
            {position.assignments.length === 0 ? (
              <Leer>Noch niemand eingeteilt.</Leer>
            ) : (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead>
                    <tr><th>Mitarbeiter</th><th>Rolle</th><th>Zeit</th><th>Kontakt</th><th>Status</th>{darfPlanen && <th style={{ width: 1 }}>Aktion</th>}</tr>
                  </thead>
                  <tbody>
                    {[...aktive, ...ersatz].map((assignment) => (
                      <tr key={assignment.id}>
                        <td>
                          <Link href={`/mitarbeiter/${assignment.employee.id}`} style={{ fontWeight: 500 }}>
                            {assignment.employee.firstName} {assignment.employee.lastName}
                          </Link>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>
                            {assignment.employee.personnelNo}{assignment.partner ? ` · ${assignment.partner.name}` : ''}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>
                          {assignment.isReserve ? 'Ersatz' : assignment.roleInTeam === 'MITARBEITER' ? '–' : assignment.roleInTeam.toLowerCase()}
                        </td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{assignment.plannedStart ?? '–'}–{assignment.plannedEnd ?? '–'}</td>
                        <td style={{ fontSize: 12 }}>
                          {assignment.employee.mobile ? <a href={`tel:${assignment.employee.mobile.replace(/\s/g, '')}`}>{assignment.employee.mobile}</a> : '–'}
                        </td>
                        <td>
                          <StatusMarke status={label(ASSIGNMENT_STATUS, assignment.status)} />
                          {assignment.declineReason && (
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{assignment.declineReason}</span>
                          )}
                        </td>
                        {darfPlanen && (
                          <td>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <AktionsFormular aktion={zuweisungStatusAktion} stil={{ display: 'flex', gap: 4 }} meldungOben={false}>
                                <input type="hidden" name="eventId" value={id} />
                                <input type="hidden" name="assignmentId" value={assignment.id} />
                                <select name="status" className="feld" defaultValue={assignment.status} style={{ width: 'auto', height: 28, fontSize: 12 }} aria-label="Status ändern">
                                  {Object.entries(ASSIGNMENT_STATUS).map(([wert, s]) => <option key={wert} value={wert}>{s.label}</option>)}
                                </select>
                                <AktionsKnopf klasse="knopf knopf-klein" laufend="…">Setzen</AktionsKnopf>
                              </AktionsFormular>
                              <AktionsFormular aktion={zuweisungEntfernenAktion} meldungOben={false}>
                                <input type="hidden" name="eventId" value={id} />
                                <input type="hidden" name="assignmentId" value={assignment.id} />
                                <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                              </AktionsFormular>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {geoeffnet && (
              <div style={{ borderTop: '1px solid var(--linie)', background: 'var(--flaeche-tief)' }}>
                <Personalsuche eventId={id} positionId={position.id} vorschlaege={vorschlaege} such={such} />
              </div>
            )}
          </Karte>
        );
      })}
    </div>
  );
}

function Personalsuche({
  eventId, positionId, vorschlaege, such,
}: {
  eventId: string; positionId: string;
  vorschlaege: Awaited<ReturnType<typeof personalVorschlaege>>;
  such: Record<string, string | undefined>;
}) {
  return (
    <div style={{ padding: 14 }}>
      <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input type="hidden" name="position" value={positionId} />
        <input name="q" className="feld" defaultValue={such.q ?? ''} placeholder="Name oder Personalnummer" style={{ width: 'auto', flex: '1 1 180px' }} aria-label="Mitarbeiter suchen" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" name="verfügbar" value="ja" defaultChecked={such.verfuegbar === 'ja'} /> nur verfügbare
        </label>
        <select name="beschäftigung" className="feld" defaultValue={such.beschaeftigung ?? ''} style={{ width: 'auto' }} aria-label="Beschäftigungsart">
          <option value="">Beschäftigung: alle</option>
          {Object.entries(EMPLOYMENT_TYPE).map(([wert, text]) => <option key={wert} value={wert}>{text}</option>)}
        </select>
        <button type="submit" className="knopf knopf-klein">Suchen</button>
      </form>

      {vorschlaege.length === 0 ? (
        <Leer>Keine passenden Mitarbeiter gefunden. Lockern Sie die Filter oder legen Sie einen neuen Mitarbeiter an.</Leer>
      ) : (
        <div className="tabelle-scroll">
          <table className="tabelle">
            <thead>
              <tr><th>Mitarbeiter</th><th>Beschäftigung</th><th>Eignung</th><th>Erfahrung</th><th style={{ width: 1 }}>Zuweisen</th></tr>
            </thead>
            <tbody>
              {vorschlaege.map((v) => (
                <tr key={v.id} className={v.abwesend || v.belegt ? 'zeile-rot' : v.qualifiziert ? 'zeile-gruen' : 'zeile-gelb'}>
                  <td>
                    <Link href={`/mitarbeiter/${v.id}`} style={{ fontWeight: 500 }}>{v.name}</Link>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{v.personnelNo}{v.city ? ` · ${v.city}` : ''}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>{EMPLOYMENT_TYPE[v.employmentType] ?? v.employmentType}</td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {v.qualifiziert ? <span className="marke marke-gruen">qualifiziert</span> : <span className="marke marke-gelb">{v.fehlendeNachweise.join(', ')}</span>}
                      {v.abwesend && <span className="marke marke-rot">{v.abwesend}</span>}
                      {v.belegt && <span className="marke marke-rot">{v.belegt}</span>}
                      {v.bereitsZugewiesen && <span className="marke marke-grau">bereits zugewiesen</span>}
                      {v.gesperrt && <span className="marke marke-rot">Sperrvermerk</span>}
                    </div>
                  </td>
                  <td className="zahl" style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>
                    {v.einsaetzeBeiKunde} bei diesem Kunden · {v.einsaetzeGesamt} gesamt
                  </td>
                  <td>
                    <Ausklapp titel="Zuweisen" knopfKlasse="knopf knopf-klein knopf-primaer">
                      <AktionsFormular aktion={zuweisenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 220 }}>
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="positionId" value={positionId} />
                        <input type="hidden" name="employeeId" value={v.id} />
                        <select name="status" className="feld" defaultValue="ANGEFRAGT" aria-label="Status">
                          <option value="ANGEFRAGT">Anfragen</option>
                          <option value="EINGETEILT">Direkt einteilen</option>
                          <option value="VORGESCHLAGEN">Nur vormerken</option>
                        </select>
                        <select name="rolle" className="feld" defaultValue="MITARBEITER" aria-label="Rolle im Team">
                          <option value="MITARBEITER">Mitarbeiter</option>
                          <option value="TEAMLEITUNG">Teamleitung</option>
                          <option value="EINSATZLEITUNG">Einsatzleitung</option>
                        </select>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                          <input type="checkbox" name="ersatz" /> als Ersatz hinterlegen
                        </label>
                        <input name="hinweis" className="feld" placeholder="Hinweis für den Mitarbeiter" />
                        {(v.abwesend || !v.qualifiziert) && (
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--gelb)' }}>
                            <input type="checkbox" name="trotzdem" /> Hinweise bewusst übergehen
                          </label>
                        )}
                        <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Übernehmen</AktionsKnopf>
                      </AktionsFormular>
                    </Ausklapp>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
