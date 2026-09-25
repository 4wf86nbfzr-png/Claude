import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { dashboardDaten } from '@/lib/queries/dashboard';
import { besetzungAus } from '@/lib/queries/coverage';
import { formatDateDE, weekdayDE } from '@/lib/time';
import { EVENT_STATUS, INCIDENT_KIND, PRIORITY, label } from '@/lib/status';
import { Balken, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { Icon } from '@/components/icons';
import { can } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await seite('dashboard.view');
  const daten = await dashboardDaten(user);
  const darfPlanen = can(user.role, 'dispo.edit');

  return (
    <>
      <Seitenkopf
        titel="Dashboard"
        unter={`${weekdayDE(new Date())}, ${formatDateDE(new Date())} · ${daten.heute.events.length} Event${daten.heute.events.length === 1 ? '' : 's'} heute`}
        aktionen={darfPlanen && (
          <>
            <Link href="/events/neu" className="knopf knopf-primaer"><Icon name="plus" /> Neues Event</Link>
            <Link href="/anfragen/neu" className="knopf"><Icon name="inbox" /> Personalanfrage</Link>
            <Link href="/mitarbeiter/neu" className="knopf"><Icon name="users" /> Mitarbeiter</Link>
            <Link href="/abgleiche/neu" className="knopf"><Icon name="upload" /> Datei hochladen</Link>
          </>
        )}
      />

      {/* -------------------------------------------------------- HEUTE */}
      <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 10px' }}>Heute</h2>
      <Raster min={150}>
        <Kennzahl wert={daten.heute.events.length} label="Events heute" href="/kalender" />
        <Kennzahl wert={daten.heute.aktiveEinsaetze} label="Eingeteilte Kräfte" />
        <Kennzahl wert={daten.heute.besetzung.offen} label="Offene Positionen"
                  farbe={daten.heute.besetzung.offen > 0 ? 'gelb' : 'gruen'} href="/disposition" />
        <Kennzahl wert={daten.dispo.unbesetzteEvents} label="Events mit Lücken"
                  farbe={daten.dispo.unbesetzteEvents > 0 ? 'gelb' : 'gruen'} href="/disposition" />
        <Kennzahl wert={daten.heute.nichtErschienen} label="Nicht erschienen"
                  farbe={daten.heute.nichtErschienen > 0 ? 'rot' : 'grau'} />
        <Kennzahl wert={daten.heute.verspaetet} label="Verspätet"
                  farbe={daten.heute.verspaetet > 0 ? 'gelb' : 'grau'} />
        <Kennzahl wert={daten.heute.kritisch} label="Kritische Probleme"
                  farbe={daten.heute.kritisch > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={daten.dispo.offeneAnfragen} label="Offene Anfragen"
                  farbe={daten.dispo.offeneAnfragen > 0 ? 'gelb' : 'grau'} href="/anfragen" />
      </Raster>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16, marginTop: 20, alignItems: 'start' }} className="dashboard-raster">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Heutige Einsätze" aktion={<Link href="/disposition" style={{ fontSize: 12, color: 'var(--text-2)' }}>Zur Disposition</Link>}>
            {daten.heute.events.length === 0 ? (
              <Leer>Heute stehen keine Einsätze an.</Leer>
            ) : (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead>
                    <tr>
                      <th>Zeit</th><th>Event</th><th>Kunde</th><th>Ort</th>
                      <th>Besetzung</th><th>Einsatzleitung</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daten.heute.events.map((event) => {
                      const b = besetzungAus(event.positions);
                      return (
                        <tr key={event.id} className={b.offen > 0 ? 'zeile-gelb' : 'zeile-gruen'}>
                          <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{event.startTime ?? '–'}–{event.endTime ?? '–'}</td>
                          <td><Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link></td>
                          <td style={{ color: 'var(--text-2)' }}>{event.customer?.name ?? '–'}</td>
                          <td style={{ color: 'var(--text-2)' }}>{event.venue ?? event.city ?? '–'}</td>
                          <td><Balken ist={b.ist} soll={b.soll} /></td>
                          <td style={{ color: 'var(--text-2)' }}>
                            {event.operationLead ? `${event.operationLead.firstName} ${event.operationLead.lastName}` : '–'}
                          </td>
                          <td><StatusMarke status={label(EVENT_STATUS, event.status)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Karte>

          <Karte titel="Nächste Einsätze" aktion={<Link href="/events" style={{ fontSize: 12, color: 'var(--text-2)' }}>Alle Events</Link>}>
            {daten.kommendeEvents.length === 0 ? (
              <Leer>Keine geplanten Einsätze.</Leer>
            ) : (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead>
                    <tr><th>Datum</th><th>Event</th><th>Kunde</th><th>Ort</th><th>Besetzung</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {daten.kommendeEvents.map((event) => {
                      const b = besetzungAus(event.positions);
                      return (
                        <tr key={event.id} className={b.offen > 0 ? 'zeile-gelb' : undefined}>
                          <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                            {formatDateDE(event.date)}
                            <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>{event.startTime ?? ''}</span>
                          </td>
                          <td><Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link></td>
                          <td style={{ color: 'var(--text-2)' }}>{event.customer?.name ?? '–'}</td>
                          <td style={{ color: 'var(--text-2)' }}>{event.venue ?? event.city ?? '–'}</td>
                          <td><Balken ist={b.ist} soll={b.soll} /></td>
                          <td><StatusMarke status={label(EVENT_STATUS, event.status)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Karte>
        </div>

        {/* ------------------------------------------------ Rechte Spalte */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Dispo-Status">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <StatusZeile label="Offene Anfragen" wert={daten.dispo.offeneAnfragen} href="/anfragen" warnAb={1} />
              <StatusZeile label="Neue E-Mails" wert={daten.dispo.neueMails} href="/anfragen?quelle=email" warnAb={1} />
              <StatusZeile label="Neue Mitarbeiter (7 Tage)" wert={daten.dispo.neueMitarbeiter} href="/mitarbeiter" />
              <StatusZeile label="Offene Abgleiche" wert={daten.dispo.offeneAbgleiche} href="/abgleiche" warnAb={1} />
              <StatusZeile label="Zeiten in Prüfung" wert={daten.dispo.problemZeiten} href="/zeiterfassung?status=OFFEN" warnAb={1} />
              <StatusZeile label="Absagen für kommende Events" wert={daten.dispo.abgesagt} href="/disposition" warnAb={1} kritisch />
            </ul>
          </Karte>

          <Karte titel="Probleme &amp; Vorfälle" aktion={<Link href="/events" style={{ fontSize: 12, color: 'var(--text-2)' }}>Alle</Link>}>
            {daten.vorfaelle.length === 0 ? (
              <Leer>Keine offenen Vorfälle.</Leer>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {daten.vorfaelle.map((vorfall) => (
                  <li key={vorfall.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--linie)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <StatusMarke status={label(PRIORITY, vorfall.priority)} />
                      <strong style={{ fontSize: 13 }}>{INCIDENT_KIND[vorfall.kind] ?? vorfall.kind}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {vorfall.employee ? `${vorfall.employee.firstName} ${vorfall.employee.lastName} · ` : ''}
                      <Link href={`/events/${vorfall.event.id}`}>{vorfall.event.name}</Link>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0' }}>{vorfall.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Karte>

          <Karte titel="Nachweise laufen ab">
            {daten.ablaufendeNachweise.length === 0 ? (
              <Leer>Alle Nachweise sind gültig.</Leer>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {daten.ablaufendeNachweise.map((nachweis) => {
                  const tage = Math.ceil((nachweis.expiresAt!.getTime() - Date.now()) / 86400000);
                  return (
                    <li key={nachweis.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--linie)' }}>
                      <span style={{ minWidth: 0 }}>
                        <Link href={`/mitarbeiter/${nachweis.employee.id}`} style={{ fontWeight: 500, fontSize: 13 }}>
                          {nachweis.employee.firstName} {nachweis.employee.lastName}
                        </Link>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{nachweis.qualification.name}</span>
                      </span>
                      <span className={`marke marke-${tage < 0 ? 'rot' : tage <= 14 ? 'gelb' : 'grau'}`} style={{ whiteSpace: 'nowrap' }}>
                        {tage < 0 ? `seit ${Math.abs(tage)} T abgelaufen` : `in ${tage} T`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Karte>
        </div>
      </div>
    </>
  );
}

function StatusZeile({ label: text, wert, href, warnAb, kritisch }: { label: string; wert: number; href: string; warnAb?: number; kritisch?: boolean }) {
  const auffaellig = warnAb != null && wert >= warnAb;
  const farbe = auffaellig ? (kritisch ? 'var(--rot)' : 'var(--gelb)') : 'var(--text-3)';
  return (
    <li style={{ borderBottom: '1px solid var(--linie)' }}>
      <Link href={href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 14px', textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: 13 }}>{text}</span>
        <span className="zahl" style={{ fontWeight: 650, fontSize: 15, color: farbe }}>{wert}</span>
      </Link>
    </li>
  );
}
