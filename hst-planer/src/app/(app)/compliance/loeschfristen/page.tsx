import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { DOCUMENT_TYPE, PRUEF_STATUS, RECHTSGRUNDLAGE, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Löschfristen' };
export const dynamic = 'force-dynamic';

/**
 * Löschkonzept (SecPlan 16).
 *
 * Je Datenkategorie: Zweck, Rechtsgrundlage, Aufbewahrungsgrund, Frist,
 * Fristbeginn, Löschdatum, Verantwortlicher. Ohne Fristbeginn ist eine
 * Frist wertlos – „sechs Jahre" beantwortet nicht, ab wann.
 *
 * Gelöscht wird hier nichts automatisch. Die Seite zeigt, was fällig
 * ist; die Ausführung ist ein bewusster Schritt, weil sie nicht
 * rückgängig zu machen ist.
 */
export default async function Loeschfristen() {
  await seite('compliance.view');
  const heute = new Date();
  const in30Tagen = new Date(heute.getTime() + 30 * 86400000);

  const [regeln, faellig, demnaechst, ohneFrist, bewerberFaellig] = await Promise.all([
    db.retentionRule.findMany({
      where: { deletedAt: null },
      orderBy: { category: 'asc' },
      include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
    }),
    db.document.findMany({
      where: { deletedAt: null, deleteAt: { not: null, lte: heute } },
      select: {
        id: true, title: true, type: true, deleteAt: true, specialCategory: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
        retentionRule: { select: { category: true } },
      },
      orderBy: { deleteAt: 'asc' },
      take: 100,
    }),
    db.document.count({ where: { deletedAt: null, deleteAt: { gt: heute, lte: in30Tagen } } }),
    db.document.count({ where: { deletedAt: null, deleteAt: null, retentionRuleId: null } }),
    db.applicant.count({ where: { deletedAt: null, deleteAt: { not: null, lte: heute } } }),
  ]);

  const geprueft = regeln.filter((r) => r.status === 'RECHTLICH_GEPRUEFT').length;

  return (
    <>
      <Seitenkopf
        titel="Löschfristen"
        unter="Löschkonzept je Datenkategorie"
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={regeln.length} label="Geführte Kategorien" />
        <Kennzahl wert={geprueft} label="Davon rechtlich geprüft"
                  farbe={geprueft === regeln.length && regeln.length > 0 ? 'gruen' : 'gelb'} />
        <Kennzahl wert={faellig.length + bewerberFaellig} label="Löschdatum erreicht"
                  farbe={faellig.length + bewerberFaellig > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={ohneFrist} label="Ohne jede Frist"
                  hinweis="wird nie gelöscht"
                  farbe={ohneFrist > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          <strong>Es wird nichts automatisch gelöscht.</strong> Diese Seite zeigt, was nach dem
          hinterlegten Konzept fällig wäre. Ob im Einzelfall eine Aufbewahrungspflicht
          entgegensteht – etwa nach § 147 AO oder § 257 HGB – entscheidet ein Mensch, bevor
          gelöscht wird.
        </Hinweis>
      </div>

      <h2 className="abschnitt">Regeln je Kategorie</h2>
      <Karte>
        {regeln.length === 0 ? (
          <Leer>Es ist noch keine Löschregel erfasst.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Kategorie</th><th>Zweck</th><th>Rechtsgrundlage</th><th>Aufbewahrungsgrund</th>
                  <th>Frist</th><th>Fristbeginn</th><th>Verantwortlich</th><th>Stand</th><th>Dokumente</th>
                </tr>
              </thead>
              <tbody>
                {regeln.map((regel) => (
                  <tr key={regel.id} className={regel.lawfulBasis === 'OFFEN' ? 'zeile-gelb' : undefined}>
                    <td style={{ fontWeight: 500 }}>{regel.category}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 240 }}>{regel.purpose}</td>
                    <td style={{ fontSize: 11 }}>
                      {regel.lawfulBasis === 'OFFEN'
                        ? <span className="marke marke-gelb">noch nicht geprüft</span>
                        : RECHTSGRUNDLAGE[regel.lawfulBasis]}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{regel.keepReason ?? '–'}</td>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                      {regel.months} Monate
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>
                        {(regel.months / 12).toFixed(1).replace('.0', '').replace('.', ',')} Jahre
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{regel.startsFrom}</td>
                    <td style={{ fontSize: 12 }}>{regel.responsible ?? '–'}</td>
                    <td><StatusMarke status={label(PRUEF_STATUS, regel.status)} /></td>
                    <td className="zahl">{regel._count.documents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <h2 className="abschnitt">Jetzt fällig</h2>
      <Karte>
        {faellig.length === 0 && bewerberFaellig === 0 ? (
          <Leer>Derzeit hat nichts sein Löschdatum erreicht.</Leer>
        ) : (
          <>
            {bewerberFaellig > 0 && (
              <div style={{ padding: '8px 12px' }}>
                <Hinweis art="warnung">
                  Zusätzlich {bewerberFaellig} {bewerberFaellig === 1 ? 'Bewerbung' : 'Bewerbungen'} mit
                  erreichtem Löschdatum. <Link href="/bewerber">Zur Bewerberliste</Link>
                </Hinweis>
              </div>
            )}
            {faellig.length > 0 && (
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead><tr><th>Unterlage</th><th>Typ</th><th>Person</th><th>Kategorie</th><th>Löschdatum</th><th>Überfällig seit</th></tr></thead>
                  <tbody>
                    {faellig.map((dokument) => {
                      const tage = Math.floor((heute.getTime() - dokument.deleteAt!.getTime()) / 86400000);
                      return (
                        <tr key={dokument.id} className="zeile-rot">
                          <td>
                            {dokument.title}
                            {dokument.specialCategory && <span className="marke marke-beige" style={{ marginLeft: 5 }}>Art. 9</span>}
                          </td>
                          <td style={{ fontSize: 12 }}>{DOCUMENT_TYPE[dokument.type] ?? dokument.type}</td>
                          <td>
                            {dokument.employee
                              ? <Link href={`/mitarbeiter/${dokument.employee.id}/datenschutz`}>
                                  {dokument.employee.lastName}, {dokument.employee.firstName}
                                </Link>
                              : '–'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{dokument.retentionRule?.category ?? '–'}</td>
                          <td className="zahl">{formatDateDE(dokument.deleteAt!)}</td>
                          <td className="zahl"><span className="marke marke-rot">{tage} T</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Karte>

      {demnaechst > 0 && (
        <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-2)' }}>
          In den nächsten 30 Tagen erreichen {demnaechst} weitere Unterlagen ihr Löschdatum.
        </p>
      )}
    </>
  );
}
