import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { formatDateDE } from '@/lib/time';
import { DOCUMENT_ACCESS, DOCUMENT_TYPE } from '@/lib/status';
import { Hinweis, Karte, Leer } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dokumente' };

/**
 * Reiter „Dokumente" der Mitarbeiterakte (SecPlan 5 und 6).
 *
 * Die Liste zeigt Metadaten, nicht Dateien: Typ, Version, Upload-Datum,
 * Gültigkeit, Ablauf, Ersteller, Zugriffsebene, Löschdatum. Die Datei
 * selbst gibt es nur über /api/dokumente/<id>, und diese Route prüft
 * Anmeldung, Recht und Zugriffsebene und schreibt jeden Abruf mit.
 * Es gibt keine URL, unter der eine Datei ohne Prüfung liegt.
 */
export default async function AkteDokumente({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('documents.view');
  const { id } = await params;

  const sichtbar = await db.employee.count({ where: { id, ...employeeFilter(user) } });
  if (sichtbar === 0) return <Karte><Leer>Dieser Datensatz ist für Ihre Rolle nicht sichtbar.</Leer></Karte>;

  // Besondere Kategorien nach Art. 9 DSGVO erscheinen nie in der normalen
  // Liste – auch nicht als Titel. Wer sie führen darf, sieht sie im
  // Reiter „Datenschutz".
  const dokumente = await db.document.findMany({
    where: { employeeId: id, deletedAt: null, specialCategory: false },
    select: {
      id: true, type: true, title: true, fileName: true, sizeBytes: true,
      version: true, createdAt: true, validFrom: true, expiresAt: true,
      access: true, deleteAt: true, visibleToEmployee: true, createdById: true,
      retentionRule: { select: { category: true, months: true } },
    },
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
  });

  const ersteller = await db.user.findMany({
    where: { id: { in: [...new Set(dokumente.map((d) => d.createdById).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, name: true },
  });
  const nameVon = new Map(ersteller.map((u) => [u.id, u.name]));

  const heute = new Date();
  const darfLaden = can(user.role, 'documents.download');
  const versteckt = await db.document.count({ where: { employeeId: id, deletedAt: null, specialCategory: true } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Hinweis art="info">
        Dokumente liegen in einem geschützten Verzeichnis ohne öffentliche Adresse. Jeder Abruf
        wird mit Benutzer, Zeitpunkt und Ergebnis protokolliert.
      </Hinweis>

      {versteckt > 0 && can(user.role, 'employees.file') && (
        <Hinweis art="warnung">
          {versteckt} {versteckt === 1 ? 'Unterlage gehört' : 'Unterlagen gehören'} zu den besonderen
          Kategorien nach Art. 9 DSGVO und {versteckt === 1 ? 'wird' : 'werden'} hier bewusst nicht
          aufgeführt. Sie stehen im Reiter „Datenschutz".
        </Hinweis>
      )}

      <Karte titel={`Dokumente (${dokumente.length})`}>
        {dokumente.length === 0 ? <Leer>Keine Unterlagen hinterlegt.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Typ</th><th>Titel</th><th>Version</th><th>Hochgeladen</th>
                  <th>Gültig ab</th><th>Läuft ab</th><th>Zugriffsebene</th>
                  <th>Ersteller</th><th>Löschdatum</th><th>Datei</th>
                </tr>
              </thead>
              <tbody>
                {dokumente.map((dokument) => {
                  const abgelaufen = dokument.expiresAt !== null && dokument.expiresAt < heute;
                  const loeschfaellig = dokument.deleteAt !== null && dokument.deleteAt <= heute;
                  return (
                    <tr key={dokument.id} className={abgelaufen || loeschfaellig ? 'zeile-rot' : undefined}>
                      <td>{DOCUMENT_TYPE[dokument.type] ?? dokument.type}</td>
                      <td>
                        {dokument.title}
                        {dokument.visibleToEmployee && (
                          <span className="marke marke-blau" style={{ marginLeft: 5 }}>für Mitarbeiter sichtbar</span>
                        )}
                      </td>
                      <td className="zahl">v{dokument.version}</td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(dokument.createdAt)}</td>
                      <td className="zahl">{dokument.validFrom ? formatDateDE(dokument.validFrom) : '–'}</td>
                      <td className="zahl">
                        {dokument.expiresAt
                          ? <span className={abgelaufen ? 'marke marke-rot' : undefined}>{formatDateDE(dokument.expiresAt)}</span>
                          : '–'}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <span className="marke marke-grau">{DOCUMENT_ACCESS[dokument.access] ?? dokument.access}</span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {dokument.createdById ? nameVon.get(dokument.createdById) ?? 'unbekannt' : '–'}
                      </td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {dokument.deleteAt
                          ? <span className={loeschfaellig ? 'marke marke-rot' : undefined}>{formatDateDE(dokument.deleteAt)}</span>
                          : <span style={{ color: 'var(--text-3)' }}>
                              {dokument.retentionRule ? `${dokument.retentionRule.months} Mon.` : 'offen'}
                            </span>}
                      </td>
                      <td>
                        {darfLaden
                          ? <a href={`/api/dokumente/${dokument.id}`}>{dokument.fileName}</a>
                          : <span className="gesperrt">kein Download</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </div>
  );
}
