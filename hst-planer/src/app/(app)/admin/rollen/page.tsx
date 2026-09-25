import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can, ROLE_BESCHREIBUNG, ROLE_LABEL, ROLE_PERMISSIONS, ROLES, navFor, scopeOf } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { Hinweis, Karte, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Rollen' };
export const dynamic = 'force-dynamic';

const SCOPE_TEXT: Record<string, string> = {
  ALLE: 'alles',
  EVENT: 'nur eigene Einsätze',
  PARTNER: 'nur das eigene Unternehmen',
  KUNDE: 'nur eigene Aufträge',
  EIGENE: 'nur der eigene Datensatz',
};

/**
 * Rollen (SecPlan 2, Bereich ADMINISTRATION; SecPlan 7 und 8).
 *
 * Die neun Rollen mit ihrer Reichweite und der Anzahl der Zugänge.
 * Die Rechte selbst stehen im Quelltext, nicht in der Datenbank: eine
 * Rolle, die sich zur Laufzeit erweitern lässt, ist kein Rechtekonzept,
 * sondern eine Einstellung. Wer etwas ändern will, ändert
 * `src/lib/auth/rbac.ts` – und das ist im Versionsverlauf nachlesbar.
 */
export default async function Rollen() {
  const user = await seite('admin.roles');

  const verteilung = await db.user.groupBy({
    by: ['role'],
    where: { deletedAt: null, active: true },
    _count: true,
  });
  const anzahlVon = new Map(verteilung.map((v) => [v.role, v._count]));

  return (
    <>
      <Seitenkopf
        titel="Rollen"
        brotkrumen={[{ href: '/admin', label: 'Administration' }]}
        unter="Neun Rollen, Standard DENY ALL"
        aktionen={<Link href="/admin/berechtigungen" className="knopf knopf-klein">Rechtematrix</Link>}
      />

      <div style={{ marginBottom: 14 }}>
        <Hinweis art="info">
          <strong>Rollen lassen sich hier nicht bearbeiten.</strong> Die Rechte stehen im
          Quelltext, nicht in der Datenbank – eine Rolle, die sich im laufenden Betrieb
          erweitern lässt, ist kein Rechtekonzept, sondern eine Einstellung. Eine Änderung geht
          durch den Versionsverlauf und ist damit nachlesbar. Zugeordnet werden Rollen unter{' '}
          <Link href="/admin/benutzer">Benutzer</Link>.
        </Hinweis>
      </div>

      <Karte>
        <div className="tabelle-scroll">
          <table className="tabelle">
            <thead>
              <tr>
                <th>Rolle</th><th>Aufgabe</th><th>Sieht</th><th>Rechte</th>
                <th>Bereiche</th><th>Aktive Zugänge</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((rolle) => {
                const rechte = rolle === 'SUPERADMIN' ? null : ROLE_PERMISSIONS[rolle].length;
                const anzahl = anzahlVon.get(rolle) ?? 0;
                return (
                  <tr key={rolle} className={rolle === 'SUPERADMIN' ? 'zeile-beige' : undefined}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {ROLE_LABEL[rolle]}
                      <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                        {rolle}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 380 }}>
                      {ROLE_BESCHREIBUNG[rolle]}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <span className={`marke marke-${scopeOf(rolle) === 'ALLE' ? 'gelb' : 'grau'}`}>
                        {SCOPE_TEXT[scopeOf(rolle)] ?? scopeOf(rolle)}
                      </span>
                    </td>
                    <td className="zahl">
                      {rechte === null
                        ? <span className="marke marke-rot">alle</span>
                        : rechte}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {navFor(rolle).map((gruppe) => (
                        <span key={gruppe.id} className="marke marke-grau" style={{ marginRight: 3 }}>{gruppe.label}</span>
                      ))}
                    </td>
                    <td className="zahl">
                      {anzahl > 0
                        ? <Link href="/admin/benutzer">{anzahl}</Link>
                        : <span style={{ color: 'var(--text-3)' }}>0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Karte>

      <h2 className="abschnitt" style={{ marginTop: 18 }}>Was eine Teamleitung ausdrücklich nicht sieht</h2>
      <Karte>
        <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)', maxWidth: '72ch' }}>
          <p style={{ margin: '0 0 10px' }}>
            Eine Teamleitung sieht zum eigenen Einsatz Name, Funktion, Einsatzzeit, Einsatzort und
            die nötige Qualifikation. Nicht sichtbar sind:
          </p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
            <li>Bankdaten und Vergütung</li>
            <li>die vollständige Personalakte</li>
            <li>die private Anschrift und das Geburtsdatum</li>
            <li>der Arbeitsvertrag</li>
            <li>Gesundheitsdaten und andere besondere Kategorien nach Art. 9 DSGVO</li>
            <li>interne Personalnotizen</li>
          </ul>
          <p style={{ margin: 0 }}>
            Diese Felder werden für die Rolle nicht aus der Datenbank geladen – sie sind nicht
            nur ausgeblendet. In der Oberfläche steht an ihrer Stelle ein benanntes Schloss,
            damit ein leeres Feld nicht mit einem fehlenden Eintrag verwechselt wird.
          </p>
        </div>
      </Karte>

      {can(user.role, 'audit.view') && (
        <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-3)' }}>
          Jede Änderung an einer Rollenzuordnung steht im{' '}
          <Link href="/compliance/audit-log">Audit-Log</Link>.
        </p>
      )}
    </>
  );
}
