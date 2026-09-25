import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { Karte, Kennzahl, Leer, Raster, Seitenkopf } from '@/components/ui';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Administration' };
export const dynamic = 'force-dynamic';

/**
 * Administration (SecPlan 2).
 *
 * Nur Überblick und Wegweiser. Die eigentliche Arbeit passiert in den
 * Unterseiten – so hängt nicht alles an einer Seite, die jede Rolle
 * halb sehen darf.
 */
export default async function Administration() {
  const user = await seite('admin.view');

  const [zugaenge, sitzungen, protokoll, letzteAnmeldungen, datensaetze] = await Promise.all([
    db.user.count({ where: { deletedAt: null, active: true } }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.auditLog.count(),
    db.auditLog.findMany({
      where: { action: { in: ['auth.login', 'auth.login.failed', 'auth.mfa.failed'] } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    Promise.all([
      db.employee.count({ where: { deletedAt: null } }),
      db.event.count({ where: { deletedAt: null } }),
      db.assignment.count({ where: { deletedAt: null } }),
      db.timeEntry.count({ where: { deletedAt: null } }),
      db.document.count({ where: { deletedAt: null } }),
    ]),
  ]);

  const [anzMitarbeiter, anzEvents, anzZuweisungen, anzZeiten, anzDokumente] = datensaetze;

  const ziele = [
    { href: '/admin/benutzer', label: 'Benutzer', icon: 'users', text: 'Zugänge anlegen, Rolle ändern, sperren', recht: 'admin.users' as const },
    { href: '/admin/rollen', label: 'Rollen', icon: 'shield', text: 'Neun Rollen mit Reichweite und Aufgabe', recht: 'admin.roles' as const },
    { href: '/admin/berechtigungen', label: 'Berechtigungen', icon: 'lock', text: 'Vollständige Rechtematrix', recht: 'admin.roles' as const },
    { href: '/einstellungen', label: 'Systemeinstellungen', icon: 'settings', text: 'Firmendaten, Fristen, Vorgaben', recht: 'settings.view' as const },
    { href: '/admin/schnittstellen', label: 'Schnittstellen', icon: 'compare', text: 'API-Schlüssel und Webhooks', recht: 'admin.api' as const },
    { href: '/admin/protokoll', label: 'Protokolle', icon: 'eye', text: 'Jede Änderung mit Benutzer und Zeitpunkt', recht: 'admin.logs' as const },
  ];

  return (
    <>
      <Seitenkopf
        titel="Administration"
        unter="Zugänge, Rechte, Schnittstellen und Protokolle"
        aktionen={can(user.role, 'security.check') && (
          <Link href="/compliance/sicherheitscheck" className="knopf knopf-primaer">Sicherheitscheck</Link>
        )}
      />

      <Raster min={150}>
        <Kennzahl wert={zugaenge} label="Aktive Zugänge" href="/admin/benutzer" />
        <Kennzahl wert={sitzungen} label="Offene Sitzungen" />
        <Kennzahl wert={anzMitarbeiter} label="Mitarbeiter" />
        <Kennzahl wert={anzEvents} label="Einsätze" />
        <Kennzahl wert={anzZuweisungen} label="Zuordnungen" />
        <Kennzahl wert={anzZeiten} label="Zeiteinträge" />
        <Kennzahl wert={anzDokumente} label="Dokumente" />
        <Kennzahl wert={protokoll} label="Protokolleinträge" href="/admin/protokoll" />
      </Raster>

      <h2 className="abschnitt" style={{ marginTop: 18 }}>Bereiche</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {ziele.filter((z) => can(user.role, z.recht)).map((ziel) => (
          <Link key={ziel.href} href={ziel.href} className="kennzahl" style={{ gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13 }}>
              <Icon name={ziel.icon} size={15} />
              {ziel.label}
            </span>
            <span className="kennzahl-zusatz">{ziel.text}</span>
          </Link>
        ))}
      </div>

      {can(user.role, 'admin.logs') && (
        <>
          <h2 className="abschnitt" style={{ marginTop: 20 }}>Letzte Anmeldungen</h2>
          <Karte>
            {letzteAnmeldungen.length === 0 ? <Leer>Noch keine Anmeldung protokolliert.</Leer> : (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead><tr><th>Zeitpunkt</th><th>Vorgang</th><th>Beschreibung</th><th>IP</th></tr></thead>
                  <tbody>
                    {letzteAnmeldungen.map((eintrag) => {
                      const gescheitert = eintrag.action !== 'auth.login';
                      return (
                        <tr key={eintrag.id} className={gescheitert ? 'zeile-rot' : undefined}>
                          <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                            {formatDateDE(eintrag.createdAt)} {eintrag.createdAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <span className={`marke marke-${gescheitert ? 'rot' : 'gruen'}`}>
                              {eintrag.action === 'auth.login' ? 'angemeldet'
                                : eintrag.action === 'auth.mfa.failed' ? 'zweiter Faktor falsch'
                                : 'Passwort falsch'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{eintrag.summary}</td>
                          <td className="zahl" style={{ fontSize: 11, color: 'var(--text-3)' }}>{eintrag.ip ?? '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Karte>
        </>
      )}
    </>
  );
}
