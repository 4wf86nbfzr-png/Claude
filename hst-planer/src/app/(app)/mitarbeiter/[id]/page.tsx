import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter, darfInterneNotizenSehen } from '@/lib/queries/scope';
import { formatDateDE, formatHours, toDateOnly } from '@/lib/time';
import { ASSIGNMENT_STATUS, AVAILABILITY_KIND, DOCUMENT_TYPE, EMPLOYMENT_TYPE, label } from '@/lib/status';
import { Karte, Kennzahl, Leer, Paar, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { Icon } from '@/components/icons';
import { mitarbeiterDeaktivierenAktion, verfuegbarkeitAktion, verfuegbarkeitLoeschenAktion, zugangAnlegenAktion } from '../actions';

export const dynamic = 'force-dynamic';

export default async function MitarbeiterDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('employees.view');
  const { id } = await params;
  const heute = toDateOnly(new Date());

  const employee = await db.employee.findFirst({
    where: { id, ...employeeFilter(user) },
    include: {
      partner: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, active: true, lastLoginAt: true } },
      qualifications: { include: { qualification: true }, orderBy: { qualification: { name: 'asc' } } },
      availabilities: { orderBy: { from: 'desc' }, take: 20 },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      assignments: {
        where: { deletedAt: null },
        include: { event: { select: { id: true, name: true, date: true, reference: true } }, position: { select: { title: true } } },
        orderBy: { event: { date: 'desc' } },
        take: 30,
      },
    },
  });
  if (!employee) notFound();

  const [stunden, kommende] = await Promise.all([
    db.timeEntry.aggregate({
      where: { employeeId: id, deletedAt: null, date: { gte: new Date(heute.getFullYear(), 0, 1) } },
      _sum: { minutes: true }, _count: true,
    }),
    db.assignment.count({ where: { employeeId: id, deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] }, event: { date: { gte: heute } } } }),
  ]);

  const intern = darfInterneNotizenSehen(user);
  const darfBearbeiten = can(user.role, 'employees.edit');
  const abgesagt = employee.assignments.filter((a) => a.status === 'ABGESAGT').length;

  return (
    <>
      <Seitenkopf
        titel={`${employee.firstName} ${employee.lastName}`}
        brotkrumen={[{ href: '/mitarbeiter', label: 'Mitarbeiter' }]}
        unter={
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="zahl">{employee.personnelNo}</span>
            <span>{EMPLOYMENT_TYPE[employee.employmentType] ?? employee.employmentType}</span>
            {employee.partner && <Link href={`/partner/${employee.partner.id}`} className="marke marke-blau">{employee.partner.name}</Link>}
            {!employee.active && <span className="marke marke-grau">inaktiv</span>}
            {employee.blocked && <span className="marke marke-rot">Sperrvermerk: {employee.blockReason}</span>}
          </span>
        }
        aktionen={darfBearbeiten && <Link href={`/mitarbeiter/${id}/bearbeiten`} className="knopf knopf-primaer">Bearbeiten</Link>}
      />

      <Raster min={160}>
        <Kennzahl wert={kommende} label="Kommende Einsätze" />
        <Kennzahl wert={employee.assignments.length} label="Einsätze (zuletzt)" />
        <Kennzahl wert={formatHours(stunden._sum.minutes ?? 0)} label={`Stunden ${heute.getFullYear()}`} />
        <Kennzahl wert={abgesagt} label="Absagen" farbe={abgesagt > 2 ? 'gelb' : 'grau'} />
      </Raster>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, marginTop: 16, alignItems: 'start' }} className="dashboard-raster">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Einsätze">
            {employee.assignments.length === 0 ? <Leer>Noch keine Einsätze.</Leer> : (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead><tr><th>Datum</th><th>Event</th><th>Position</th><th>Zeit</th><th>Status</th></tr></thead>
                  <tbody>
                    {employee.assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(a.event.date)}</td>
                        <td><Link href={`/events/${a.event.id}`}>{a.event.name}</Link></td>
                        <td style={{ color: 'var(--text-2)' }}>{a.position.title}</td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{a.plannedStart ?? '–'}–{a.plannedEnd ?? '–'}</td>
                        <td><StatusMarke status={label(ASSIGNMENT_STATUS, a.status)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Karte>

          <Karte titel="Verfügbarkeiten & Abwesenheiten">
            {employee.availabilities.length === 0 ? <Leer>Keine Einträge.</Leer> : (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead><tr><th>Art</th><th>Von</th><th>Bis</th><th>Notiz</th>{darfBearbeiten && <th style={{ width: 1 }} />}</tr></thead>
                  <tbody>
                    {employee.availabilities.map((eintrag) => (
                      <tr key={eintrag.id}>
                        <td><StatusMarke status={label(AVAILABILITY_KIND, eintrag.kind)} /></td>
                        <td className="zahl">{formatDateDE(eintrag.from)}</td>
                        <td className="zahl">{formatDateDE(eintrag.to)}</td>
                        <td style={{ color: 'var(--text-2)' }}>{eintrag.note ?? '–'}</td>
                        {darfBearbeiten && (
                          <td>
                            <AktionsFormular aktion={verfuegbarkeitLoeschenAktion} meldungOben={false}>
                              <input type="hidden" name="id" value={eintrag.id} />
                              <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                            </AktionsFormular>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {darfBearbeiten && (
              <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
                <AktionsFormular aktion={verfuegbarkeitAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input type="hidden" name="employeeId" value={id} />
                  <label className="feld-gruppe" style={{ width: 'auto' }}>
                    <span className="feld-label">Art</span>
                    <select name="art" className="feld" style={{ width: 'auto' }}>
                      {Object.entries(AVAILABILITY_KIND).map(([wert, s]) => <option key={wert} value={wert}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="feld-gruppe" style={{ width: 'auto' }}>
                    <span className="feld-label">Von</span>
                    <input name="von" type="date" className="feld" required style={{ width: 'auto' }} />
                  </label>
                  <label className="feld-gruppe" style={{ width: 'auto' }}>
                    <span className="feld-label">Bis</span>
                    <input name="bis" type="date" className="feld" style={{ width: 'auto' }} />
                  </label>
                  <input name="notiz" className="feld" placeholder="Notiz" style={{ width: 'auto', flex: '1 1 140px' }} aria-label="Notiz" />
                  <AktionsKnopf klasse="knopf knopf-klein">Hinzufügen</AktionsKnopf>
                </AktionsFormular>
              </div>
            )}
          </Karte>

          <Karte titel="Dokumente" aktion={<Link href={`/dokumente?mitarbeiter=${id}`} className="knopf knopf-klein"><Icon name="upload" /> Hochladen</Link>}>
            {employee.documents.length === 0 ? <Leer>Keine Dokumente hinterlegt.</Leer> : (
              <table className="tabelle">
                <thead><tr><th>Typ</th><th>Titel</th><th>Gültig bis</th><th>Datei</th></tr></thead>
                <tbody>
                  {employee.documents.map((dokument) => {
                    const abgelaufen = dokument.expiresAt && dokument.expiresAt < heute;
                    return (
                      <tr key={dokument.id} className={abgelaufen ? 'zeile-rot' : undefined}>
                        <td>{DOCUMENT_TYPE[dokument.type] ?? dokument.type}</td>
                        <td>{dokument.title}</td>
                        <td className="zahl">{dokument.expiresAt ? formatDateDE(dokument.expiresAt) : '–'}</td>
                        <td><a href={`/api/dokumente/${dokument.id}`}>{dokument.fileName}</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Karte>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Kontakt">
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Paar label="Mobil">{employee.mobile ? <a href={`tel:${employee.mobile.replace(/\s/g, '')}`}>{employee.mobile}</a> : '–'}</Paar>
              <Paar label="Telefon">{employee.phone ?? '–'}</Paar>
              <Paar label="E-Mail">{employee.email ? <a href={`mailto:${employee.email}`}>{employee.email}</a> : '–'}</Paar>
              <Paar label="Adresse">{[employee.street, [employee.zip, employee.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}</Paar>
              <Paar label="Geburtsdatum">{employee.birthDate ? formatDateDE(employee.birthDate) : '–'}</Paar>
              <Paar label="Führerschein">{employee.drivingLicence ?? '–'}</Paar>
            </div>
          </Karte>

          <Karte titel="Qualifikationen">
            {employee.qualifications.length === 0 ? <Leer>Keine hinterlegt.</Leer> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {employee.qualifications.map((q) => {
                  const tage = q.expiresAt ? Math.ceil((q.expiresAt.getTime() - Date.now()) / 86400000) : null;
                  return (
                    <li key={q.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--linie)' }}>
                      <span style={{ fontSize: 13 }}>{q.qualification.name}</span>
                      {tage == null ? <span className="marke marke-gruen">unbefristet</span>
                        : <span className={`marke marke-${tage < 0 ? 'rot' : tage <= 30 ? 'gelb' : 'gruen'}`}>
                            {tage < 0 ? 'abgelaufen' : `bis ${formatDateDE(q.expiresAt!)}`}
                          </span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Karte>

          {intern && (employee.notesInternal || employee.infoForEmployee) && (
            <Karte titel="Notizen">
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {employee.infoForEmployee && <Paar label="Info für den Mitarbeiter"><span style={{ whiteSpace: 'pre-wrap' }}>{employee.infoForEmployee}</span></Paar>}
                {employee.notesInternal && (
                  <div style={{ background: 'var(--gelb-flaeche)', border: '1px solid var(--gelb)33', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                    <Paar label="Intern – nicht für den Mitarbeiter"><span style={{ whiteSpace: 'pre-wrap' }}>{employee.notesInternal}</span></Paar>
                  </div>
                )}
              </div>
            </Karte>
          )}

          <Karte titel="Zugang zur Mitarbeiter-App">
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {employee.user ? (
                <>
                  <Paar label="Anmeldung">{employee.user.email}</Paar>
                  <Paar label="Zuletzt angemeldet">{employee.user.lastLoginAt ? formatDateDE(employee.user.lastLoginAt) : 'noch nie'}</Paar>
                  <Paar label="Status">{employee.user.active ? 'aktiv' : 'gesperrt'}</Paar>
                </>
              ) : can(user.role, 'admin.users') ? (
                <Ausklapp titel="Zugang anlegen" knopfKlasse="knopf knopf-klein">
                  <AktionsFormular aktion={zugangAnlegenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="hidden" name="id" value={id} />
                    <input name="email" type="email" className="feld" required defaultValue={employee.email ?? ''} placeholder="E-Mail für die Anmeldung" />
                    <input name="passwort" type="text" className="feld" required minLength={12} placeholder="Startpasswort (mind. 12 Zeichen)" />
                    <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Zugang anlegen</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Kein Zugang eingerichtet.</p>
              )}
            </div>
          </Karte>

          {darfBearbeiten && employee.active && (
            <Karte titel="Aktionen">
              <div style={{ padding: 14 }}>
                <Ausklapp titel="Mitarbeiter deaktivieren" knopfKlasse="knopf knopf-klein knopf-gefahr">
                  <AktionsFormular aktion={mitarbeiterDeaktivierenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="hidden" name="id" value={id} />
                    <p className="feld-hinweis" style={{ margin: 0 }}>
                      Der Datensatz bleibt für Auswertungen und Nachweise erhalten, der Mitarbeiter
                      erscheint aber nicht mehr in der Personalsuche.
                    </p>
                    <textarea name="grund" className="feld" rows={2} required placeholder="Grund" />
                    <AktionsKnopf klasse="knopf knopf-gefahr knopf-klein">Deaktivieren</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              </div>
            </Karte>
          )}
        </div>
      </div>
    </>
  );
}
