import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can, ROLE_LABEL, type Role } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { WEBHOOK_EVENTS } from '@/lib/webhooks';
import { Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import {
  apiSchluesselAktion, apiSchluesselSperrenAktion, benutzerAendernAktion,
  benutzerAnlegenAktion, passwortZuruecksetzenAktion, webhookAktion, webhookEntfernenAktion,
} from './actions';

export const metadata: Metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

export default async function Admin() {
  const user = await seite('admin.view');
  const darfBenutzer = can(user.role, 'admin.users');
  const darfApi = can(user.role, 'admin.api');

  const [benutzer, schluessel, webhooks, lieferungen, statistik, mitarbeiter, partner, kunden] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    }),
    darfApi ? db.apiKey.findMany({ orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    darfApi ? db.webhook.findMany({ orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    darfApi ? db.webhookDelivery.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { webhook: { select: { name: true } } } }) : Promise.resolve([]),
    Promise.all([
      db.employee.count({ where: { deletedAt: null } }),
      db.event.count({ where: { deletedAt: null } }),
      db.assignment.count({ where: { deletedAt: null } }),
      db.timeEntry.count({ where: { deletedAt: null } }),
      db.auditLog.count(),
      db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]),
    darfBenutzer ? db.employee.findMany({ where: { deletedAt: null, user: null }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }) : Promise.resolve([]),
    darfBenutzer ? db.partner.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }) : Promise.resolve([]),
    darfBenutzer ? db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  const [anzMitarbeiter, anzEvents, anzZuweisungen, anzZeiten, anzProtokoll, anzSitzungen] = statistik;

  return (
    <>
      <Seitenkopf titel="Administration" unter="Benutzer, Schnittstellen und Protokoll"
                  aktionen={can(user.role, 'audit.view') && <Link href="/admin/protokoll" className="knopf">Protokoll ansehen</Link>} />

      <Raster min={150}>
        <Kennzahl wert={benutzer.filter((b) => b.active).length} label="Aktive Zugänge" />
        <Kennzahl wert={anzSitzungen} label="Offene Sitzungen" />
        <Kennzahl wert={anzMitarbeiter} label="Mitarbeiter" />
        <Kennzahl wert={anzEvents} label="Events" />
        <Kennzahl wert={anzZuweisungen} label="Zuweisungen" />
        <Kennzahl wert={anzZeiten} label="Zeiteinträge" />
        <Kennzahl wert={anzProtokoll} label="Protokolleinträge" href="/admin/protokoll" />
      </Raster>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <Karte titel="Benutzer & Rollen">
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>Letzte Anmeldung</th>{darfBenutzer && <th style={{ width: 1 }} />}</tr></thead>
              <tbody>
                {benutzer.map((konto) => (
                  <tr key={konto.id} className={konto.active ? undefined : 'zeile-grau'}>
                    <td>
                      {konto.name}
                      {konto.employee && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>Mitarbeiterprofil verknüpft</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{konto.email}</td>
                    <td>{ROLE_LABEL[konto.role as Role]}</td>
                    <td>
                      {konto.active ? <span className="marke marke-gruen">aktiv</span> : <span className="marke marke-grau">gesperrt</span>}
                      {konto.mustChangePassword && <span className="marke marke-gelb" style={{ marginLeft: 5 }}>Passwortwechsel</span>}
                      {konto.lockedUntil && konto.lockedUntil > new Date() && <span className="marke marke-rot" style={{ marginLeft: 5 }}>gesperrt bis {formatDateDE(konto.lockedUntil)}</span>}
                    </td>
                    <td className="zahl" style={{ fontSize: 12, color: 'var(--text-2)' }}>{konto.lastLoginAt ? formatDateDE(konto.lastLoginAt) : 'nie'}</td>
                    {darfBenutzer && (
                      <td>
                        <Ausklapp titel="Bearbeiten" knopfKlasse="knopf knopf-klein">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
                            <AktionsFormular aktion={benutzerAendernAktion} stil={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <input type="hidden" name="id" value={konto.id} />
                              <select name="rolle" className="feld" defaultValue={konto.role} style={{ width: 'auto' }} aria-label="Rolle">
                                {Object.entries(ROLE_LABEL).map(([wert, text]) => <option key={wert} value={wert}>{text}</option>)}
                              </select>
                              <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                                <input type="checkbox" name="aktiv" defaultChecked={konto.active} /> aktiv
                              </label>
                              <AktionsKnopf klasse="knopf knopf-klein knopf-primaer">Speichern</AktionsKnopf>
                            </AktionsFormular>
                            <AktionsFormular aktion={passwortZuruecksetzenAktion} meldungOben={false} geheimnisLabel="Neues Startpasswort">
                              <input type="hidden" name="id" value={konto.id} />
                              <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr">Passwort zurücksetzen</AktionsKnopf>
                            </AktionsFormular>
                          </div>
                        </Ausklapp>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {darfBenutzer && (
            <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
              <Ausklapp titel="+ Benutzer anlegen" knopfKlasse="knopf knopf-klein">
                <AktionsFormular aktion={benutzerAnlegenAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', maxWidth: 820 }}>
                  <input name="name" className="feld" placeholder="Name" required style={{ width: 'auto', flex: '1 1 140px' }} aria-label="Name" />
                  <input name="email" type="email" className="feld" placeholder="E-Mail" required style={{ width: 'auto', flex: '1 1 180px' }} aria-label="E-Mail" />
                  <input name="passwort" className="feld" placeholder="Startpasswort (12+)" required minLength={12} style={{ width: 'auto', flex: '1 1 160px' }} aria-label="Startpasswort" />
                  <select name="rolle" className="feld" defaultValue="MITARBEITER" style={{ width: 'auto' }} aria-label="Rolle">
                    {Object.entries(ROLE_LABEL).map(([wert, text]) => <option key={wert} value={wert}>{text}</option>)}
                  </select>
                  <select name="employeeId" className="feld" defaultValue="" style={{ width: 'auto' }} aria-label="Mitarbeiterprofil">
                    <option value="">kein Mitarbeiterprofil</option>
                    {mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.lastName}, {m.firstName}</option>)}
                  </select>
                  <select name="partnerId" className="feld" defaultValue="" style={{ width: 'auto' }} aria-label="Partner">
                    <option value="">kein Partner</option>
                    {partner.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select name="customerId" className="feld" defaultValue="" style={{ width: 'auto' }} aria-label="Kunde">
                    <option value="">kein Kunde</option>
                    {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                  <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Anlegen</AktionsKnopf>
                </AktionsFormular>
              </Ausklapp>
            </div>
          )}
        </Karte>

        {darfApi && (
          <>
            <Karte titel="API-Schlüssel">
              {schluessel.length === 0 ? <Leer>Noch keine Schlüssel vergeben.</Leer> : (
                <table className="tabelle">
                  <thead><tr><th>Name</th><th>Präfix</th><th>Bereiche</th><th>Zuletzt genutzt</th><th>Status</th><th style={{ width: 1 }} /></tr></thead>
                  <tbody>
                    {schluessel.map((key) => (
                      <tr key={key.id} className={key.active ? undefined : 'zeile-grau'}>
                        <td>{key.name}</td>
                        <td className="zahl" style={{ fontSize: 12 }}>hst_{key.prefix}_…</td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{key.scopes.join(', ') || 'alle'}</td>
                        <td className="zahl" style={{ fontSize: 12 }}>{key.lastUsedAt ? formatDateDE(key.lastUsedAt) : 'nie'}</td>
                        <td>{key.active ? <span className="marke marke-gruen">aktiv</span> : <span className="marke marke-grau">gesperrt</span>}</td>
                        <td>
                          {key.active && (
                            <AktionsFormular aktion={apiSchluesselSperrenAktion} meldungOben={false}>
                              <input type="hidden" name="id" value={key.id} />
                              <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Sperren</AktionsKnopf>
                            </AktionsFormular>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
                <AktionsFormular aktion={apiSchluesselAktion} meldungOben={false} geheimnisLabel="API-Schlüssel"
                                 stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input name="name" className="feld" placeholder="Bezeichnung, z. B. Website-Formular" required style={{ width: 'auto', flex: '1 1 220px' }} aria-label="Bezeichnung" />
                  {['requests', 'events', 'employees', 'jobs'].map((bereich) => (
                    <label key={bereich} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                      <input type="checkbox" name="scopes" value={bereich} /> {bereich}
                    </label>
                  ))}
                  <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Schlüssel erzeugen</AktionsKnopf>
                </AktionsFormular>
              </div>
            </Karte>

            <Karte titel="Webhooks">
              {webhooks.length === 0 ? <Leer>Keine Webhooks eingerichtet.</Leer> : (
                <table className="tabelle">
                  <thead><tr><th>Name</th><th>Ziel</th><th>Ereignisse</th><th style={{ width: 1 }} /></tr></thead>
                  <tbody>
                    {webhooks.map((hook) => (
                      <tr key={hook.id}>
                        <td>{hook.name}</td>
                        <td style={{ fontSize: 12, wordBreak: 'break-all' }}>{hook.url}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{hook.events.join(', ')}</td>
                        <td>
                          <AktionsFormular aktion={webhookEntfernenAktion} meldungOben={false}>
                            <input type="hidden" name="id" value={hook.id} />
                            <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                          </AktionsFormular>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
                <Ausklapp titel="+ Webhook" knopfKlasse="knopf knopf-klein">
                  <AktionsFormular aktion={webhookAktion} meldungOben={false} geheimnisLabel="Signaturgeheimnis"
                                   stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', maxWidth: 780 }}>
                    <input name="name" className="feld" placeholder="Name" required style={{ width: 'auto', flex: '1 1 140px' }} aria-label="Name" />
                    <input name="url" type="url" className="feld" placeholder="https://…" required style={{ width: 'auto', flex: '1 1 260px' }} aria-label="Zieladresse" />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 100%' }}>
                      {WEBHOOK_EVENTS.map((ereignis) => (
                        <label key={ereignis} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }}>
                          <input type="checkbox" name="events" value={ereignis} /> {ereignis}
                        </label>
                      ))}
                    </div>
                    <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">Anlegen</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              </div>
            </Karte>

            {lieferungen.length > 0 && (
              <Karte titel="Letzte Webhook-Zustellungen">
                <table className="tabelle">
                  <thead><tr><th>Zeitpunkt</th><th>Webhook</th><th>Ereignis</th><th>Ergebnis</th></tr></thead>
                  <tbody>
                    {lieferungen.map((lieferung) => (
                      <tr key={lieferung.id} className={lieferung.deliveredAt ? 'zeile-gruen' : 'zeile-rot'}>
                        <td className="zahl" style={{ fontSize: 12 }}>{formatDateDE(lieferung.createdAt)}</td>
                        <td>{lieferung.webhook.name}</td>
                        <td style={{ fontSize: 12 }}>{lieferung.event}</td>
                        <td style={{ fontSize: 12 }}>{lieferung.deliveredAt ? `HTTP ${lieferung.status}` : lieferung.error ?? 'offen'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Karte>
            )}
          </>
        )}
      </div>
    </>
  );
}
