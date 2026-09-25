import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can, ROLE_LABEL, type Role } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Kennzahl, Raster, Seitenkopf } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import {
  benutzerAendernAktion, benutzerAnlegenAktion, passwortZuruecksetzenAktion,
} from '../actions';

export const metadata: Metadata = { title: 'Benutzer' };
export const dynamic = 'force-dynamic';

/**
 * Benutzerverwaltung (SecPlan 2, Bereich ADMINISTRATION).
 *
 * Wer darf hinein, mit welcher Rolle, seit wann – und wer nicht mehr.
 * Der Sicherheitscheck prueft dieselbe Liste auf ausgeschiedene Zugaenge
 * und fehlende zweite Faktoren; von hier aus wird sie geaendert.
 */
export default async function Benutzerverwaltung() {
  const user = await seite('admin.users');
  const darfBenutzer = true;

  const [benutzer, mitarbeiter, partner, kunden, sitzungen] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      include: { employee: { select: { firstName: true, lastName: true, active: true, deletedAt: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    }),
    db.employee.findMany({ where: { deletedAt: null, user: null }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
    db.partner.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);

  const ohneFaktor = benutzer.filter(
    (k) => k.active && !k.totpEnabled
      && (k.role === 'SUPERADMIN' || can(k.role as Role, 'employees.file') || can(k.role as Role, 'admin.users')),
  );
  const ausgeschieden = benutzer.filter((k) => k.active && k.employee && (!k.employee.active || k.employee.deletedAt));

  return (
    <>
      <Seitenkopf
        titel="Benutzer"
        brotkrumen={[{ href: '/admin', label: 'Administration' }]}
        unter={`${benutzer.filter((b) => b.active).length} aktive Zugänge`}
        aktionen={can(user.role, 'security.check') && <Link href="/compliance/sicherheitscheck" className="knopf knopf-klein">Sicherheitscheck</Link>}
      />

      <Raster min={160}>
        <Kennzahl wert={benutzer.filter((b) => b.active).length} label="Aktive Zugänge" />
        <Kennzahl wert={sitzungen} label="Offene Sitzungen" />
        <Kennzahl wert={ohneFaktor.length} label="Privilegiert ohne zweiten Faktor"
                  farbe={ohneFaktor.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={ausgeschieden.length} label="Ausgeschieden mit Zugang"
                  farbe={ausgeschieden.length > 0 ? 'rot' : 'gruen'} />
      </Raster>

      {ohneFaktor.length > 0 && (
        <div style={{ margin: '12px 0' }}>
          <Hinweis art="warnung">
            {ohneFaktor.length} {ohneFaktor.length === 1 ? 'Zugang kann' : 'Zugänge können'} Personalakten
            öffnen oder Benutzer verwalten, ohne einen zweiten Faktor: {ohneFaktor.map((k) => k.name).join(', ')}.
            Einrichten kann ihn nur die betroffene Person selbst unter „Sicherheit".
          </Hinweis>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Karte titel="Zugänge">
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>Zweiter Faktor</th><th>Letzte Anmeldung</th>{darfBenutzer && <th style={{ width: 1 }} />}</tr></thead>
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
                    <td>
                      {konto.totpEnabled
                        ? <span className="marke marke-gruen">eingerichtet</span>
                        : <span className="marke marke-grau">keiner</span>}
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
      </div>
    </>
  );
}
