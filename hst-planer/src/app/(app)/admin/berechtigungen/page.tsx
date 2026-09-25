import { Fragment } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { ALLE_RECHTE, can, ROLE_LABEL, ROLES, type Permission } from '@/lib/auth/rbac';
import { Hinweis, Karte, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Berechtigungen' };
export const dynamic = 'force-dynamic';

/** Klartext je Recht – die Matrix ist sonst nur für Entwickler lesbar. */
const ERKLAERUNG: Partial<Record<Permission, string>> = {
  'employees.file': 'Vollständige Personalakte einsehen',
  'employees.finance': 'Vergütung und Vertragsdaten einsehen',
  'employees.notes': 'Interne Personalnotizen einsehen',
  'employees.sensitive': 'Besondere Kategorien nach Art. 9 DSGVO',
  'dispo.assign': 'Kräfte auf Positionen zuordnen',
  'timesheets.approve': 'Erfasste Zeiten freigeben',
  'export.run': 'Daten aus dem System exportieren',
  'audit.view': 'Protokolle einsehen',
  'security.check': 'Sicherheitscheck ausführen',
  'admin.users': 'Zugänge anlegen, ändern, sperren',
  'admin.roles': 'Rollen und Rechte einsehen',
  'admin.api': 'Schnittstellen verwalten',
  'compliance.approve': 'Compliance-Unterlagen freigeben',
  'compliance.breaches': 'Datenschutzvorfälle bearbeiten',
};

/** Gruppierung nach dem Präfix vor dem Punkt. */
const BEREICH_NAME: Record<string, string> = {
  dashboard: 'Dashboard', dispo: 'Disposition', calendar: 'Kalender',
  employees: 'Personal', applicants: 'Bewerber', qualifications: 'Qualifikationen',
  availability: 'Verfügbarkeiten', trainings: 'Schulungen',
  events: 'Einsätze', objects: 'Objekte', customers: 'Kunden',
  requests: 'Anfragen', reconciliation: 'Abgleiche',
  timesheets: 'Zeiterfassung', partners: 'Partner', documents: 'Dokumente',
  communication: 'Kommunikation', reports: 'Auswertungen', finance: 'Finanzen',
  export: 'Export', compliance: 'Compliance', audit: 'Protokoll', security: 'Sicherheit',
  settings: 'Einstellungen', admin: 'Administration', self: 'Eigener Bereich',
};

/**
 * Rechtematrix (SecPlan 2, Bereich ADMINISTRATION; SecPlan 8).
 *
 * Die vollständige Wahrheit darüber, wer was darf – erzeugt aus
 * derselben Quelle, die auch die Prüfung macht. Dadurch kann die
 * Anzeige nicht von der Wirklichkeit abweichen; ein Rechtekonzept in
 * einer Textdatei daneben würde genau das nach einem halben Jahr tun.
 */
export default async function Berechtigungen() {
  await seite('admin.roles');

  /*
    Bewusst ALLE_RECHTE und nicht die Vereinigung der Rollen: sonst
    fehlte `employees.sensitive` in der Tabelle, weil es absichtlich
    keine Rolle hat – und gerade das gehört sichtbar.
  */
  const alle: readonly Permission[] = ALLE_RECHTE;

  const nachBereich = new Map<string, Permission[]>();
  for (const recht of alle) {
    const bereich = recht.split('.')[0] ?? recht;
    const liste = nachBereich.get(bereich);
    if (liste) liste.push(recht);
    else nachBereich.set(bereich, [recht]);
  }

  return (
    <>
      <Seitenkopf
        titel="Berechtigungen"
        brotkrumen={[{ href: '/admin', label: 'Administration' }]}
        unter={`${alle.length} Rechte über ${ROLES.length} Rollen`}
        aktionen={<Link href="/admin/rollen" className="knopf knopf-klein">Rollenübersicht</Link>}
      />

      <div style={{ marginBottom: 14 }}>
        <Hinweis art="info">
          Diese Tabelle wird aus derselben Quelle erzeugt, die auch die Prüfung macht. Sie kann
          deshalb nicht von der Wirklichkeit abweichen. Ein leeres Feld heißt: nicht erlaubt –
          Standard ist DENY ALL, es gibt keine Vererbung.
        </Hinweis>
      </div>

      <Karte>
        <div className="tabelle-scroll">
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Recht</th>
                {ROLES.map((rolle) => (
                  <th key={rolle} style={{ textAlign: 'center', minWidth: 72, fontSize: 10 }}>
                    {ROLE_LABEL[rolle]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...nachBereich.entries()].map(([bereich, rechte]) => (
                <Fragment key={bereich}>
                  <tr>
                    <td colSpan={ROLES.length + 1}
                        style={{
                          background: 'var(--tief)', fontWeight: 700, fontSize: 10,
                          letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-2)',
                        }}>
                      {BEREICH_NAME[bereich] ?? bereich}
                    </td>
                  </tr>
                  {rechte.map((recht) => (
                    <tr key={recht}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{recht}</span>
                        {ERKLAERUNG[recht] && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>
                            {ERKLAERUNG[recht]}
                          </span>
                        )}
                      </td>
                      {ROLES.map((rolle) => {
                        const erlaubt = can(rolle, recht);
                        return (
                          <td key={rolle} style={{ textAlign: 'center' }}>
                            {erlaubt
                              ? <span className={`marke marke-${rolle === 'SUPERADMIN' ? 'beige' : 'gruen'}`}
                                      title={`${ROLE_LABEL[rolle]} darf ${recht}`}>ja</span>
                              : <span style={{ color: 'var(--text-3)' }} title={`${ROLE_LABEL[rolle]} darf ${recht} nicht`}>–</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Karte>

      <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-2)', maxWidth: '68ch', lineHeight: 1.55 }}>
        Der Superadmin ist in der Tabelle überall mit „ja" markiert, obwohl seine Rechteliste im
        Quelltext leer ist. Das ist kein Widerspruch: er wird in der Prüfung gesondert behandelt,
        damit die Ausnahme beim Lesen des Codes nicht zu übersehen ist. Die leere Liste sorgt
        zusätzlich dafür, dass niemand sie versehentlich als Vorlage für eine neue Rolle kopiert.
      </p>
    </>
  );
}
