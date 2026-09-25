import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { ANFRAGE_STATUS, BETROFFENEN_RECHT, PRUEF_STATUS, RECHTSGRUNDLAGE, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Datenschutz' };
export const dynamic = 'force-dynamic';

/**
 * Datenschutz (SecPlan 18 und 17).
 *
 * Zwei Dinge auf einer Seite, weil sie zusammengehören: das Verzeichnis
 * der Verarbeitungstätigkeiten nach Art. 30 – also was wir womit tun –
 * und die Betroffenenanfragen nach Art. 12–22 – also was Menschen dazu
 * von uns wollen. Wer eine Auskunft beantwortet, braucht das Verzeichnis.
 *
 * Rechtsgrundlagen stehen auf „noch nicht geprüft", solange niemand sie
 * eingetragen hat. Das System rät nicht.
 */
export default async function Datenschutz() {
  await seite('compliance.view');
  const heute = new Date();

  const [taetigkeiten, anfragen] = await Promise.all([
    db.processingActivity.findMany({
      where: { deletedAt: null },
      orderBy: { number: 'asc' },
      select: {
        id: true, number: true, name: true, purpose: true, lawfulBasis: true, lawfulBasisNote: true,
        dataSubjects: true, dataCategories: true, specialCategory: true, recipients: true,
        thirdCountry: true, retention: true, responsible: true, status: true,
        reviewedBy: true, reviewedAt: true, nextReviewAt: true,
        processors: { select: { processor: { select: { id: true, name: true } } } },
      },
    }),
    db.dataSubjectRequest.findMany({
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 100,
    }),
  ]);

  const offeneGrundlagen = taetigkeiten.filter((t) => t.lawfulBasis === 'OFFEN');
  const offeneAnfragen = anfragen.filter((a) => !['BEANTWORTET', 'ABGELEHNT'].includes(a.status));
  const ueberfaellig = offeneAnfragen.filter((a) => (a.extendedTo ?? a.dueAt) < heute);

  return (
    <>
      <Seitenkopf
        titel="Datenschutz"
        unter="Verzeichnis von Verarbeitungstätigkeiten und Betroffenenanfragen"
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={taetigkeiten.length} label="Verarbeitungstätigkeiten" />
        <Kennzahl wert={offeneGrundlagen.length} label="Ohne geprüfte Rechtsgrundlage"
                  farbe={offeneGrundlagen.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={offeneAnfragen.length} label="Offene Betroffenenanfragen"
                  farbe={offeneAnfragen.length > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={ueberfaellig.length} label="Über der Frist"
                  hinweis="ein Monat nach Art. 12 Abs. 3"
                  farbe={ueberfaellig.length > 0 ? 'rot' : 'gruen'} />
      </Raster>

      {offeneGrundlagen.length > 0 && (
        <div style={{ margin: '12px 0' }}>
          <Hinweis art="fehler">
            Für {offeneGrundlagen.length} {offeneGrundlagen.length === 1 ? 'Tätigkeit' : 'Tätigkeiten'} ist
            keine Rechtsgrundlage eingetragen. Das System trägt keine ein – welche Grundlage trägt,
            ist eine rechtliche Entscheidung und gehört von einem Menschen getroffen.
          </Hinweis>
        </div>
      )}

      <h2 className="abschnitt">Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO)</h2>
      <Karte>
        {taetigkeiten.length === 0 ? (
          <Leer>Es ist noch keine Verarbeitungstätigkeit erfasst.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Nr.</th><th>Tätigkeit</th><th>Zweck</th><th>Rechtsgrundlage</th>
                  <th>Betroffene</th><th>Datenkategorien</th><th>Empfänger</th>
                  <th>Drittland</th><th>Löschfrist</th><th>Verantwortlich</th><th>Stand</th><th>Wiedervorlage</th>
                </tr>
              </thead>
              <tbody>
                {taetigkeiten.map((t) => (
                  <tr key={t.id} className={t.lawfulBasis === 'OFFEN' ? 'zeile-rot' : t.specialCategory ? 'zeile-beige' : undefined}>
                    <td className="zahl">{t.number}</td>
                    <td style={{ fontWeight: 500 }}>
                      {t.name}
                      {t.specialCategory && <span className="marke marke-beige" style={{ marginLeft: 5 }}>Art. 9</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 240 }}>{t.purpose}</td>
                    <td style={{ fontSize: 11 }}>
                      {t.lawfulBasis === 'OFFEN'
                        ? <span className="marke marke-rot">noch nicht geprüft</span>
                        : <span title={t.lawfulBasisNote ?? undefined}>{RECHTSGRUNDLAGE[t.lawfulBasis]}</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.dataSubjects}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 220 }}>{t.dataCategories}</td>
                    <td style={{ fontSize: 11 }}>
                      {t.processors.length > 0
                        ? t.processors.map((p) => (
                            <Link key={p.processor.id} href="/compliance/avv" className="marke marke-grau" style={{ marginRight: 3 }}>
                              {p.processor.name}
                            </Link>
                          ))
                        : t.recipients ?? '–'}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {t.thirdCountry
                        ? <span className="marke marke-gelb">{t.thirdCountry}</span>
                        : <span style={{ color: 'var(--text-3)' }}>nein</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.retention}</td>
                    <td style={{ fontSize: 12 }}>{t.responsible ?? '–'}</td>
                    <td>
                      <StatusMarke status={label(PRUEF_STATUS, t.status)} />
                      {t.reviewedBy && (
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>
                          {t.reviewedBy}{t.reviewedAt ? `, ${formatDateDE(t.reviewedAt)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                      {t.nextReviewAt
                        ? <span className={t.nextReviewAt <= heute ? 'marke marke-gelb' : undefined}>{formatDateDE(t.nextReviewAt)}</span>
                        : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <h2 className="abschnitt">Betroffenenanfragen (Art. 12–22 DSGVO)</h2>
      <Karte>
        {anfragen.length === 0 ? (
          <Leer>Es liegt keine Betroffenenanfrage vor.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Nr.</th><th>Recht</th><th>Betroffene Person</th><th>Art</th>
                  <th>Eingang</th><th>Identität geprüft</th><th>Frist</th><th>Beantwortet</th>
                  <th>Status</th><th>Bearbeitung</th>
                </tr>
              </thead>
              <tbody>
                {anfragen.map((anfrage) => {
                  const frist = anfrage.extendedTo ?? anfrage.dueAt;
                  const offen = !['BEANTWORTET', 'ABGELEHNT'].includes(anfrage.status);
                  const spaet = offen && frist < heute;
                  return (
                    <tr key={anfrage.id} className={spaet ? 'zeile-rot' : offen ? 'zeile-gelb' : undefined}>
                      <td className="zahl">{anfrage.number}</td>
                      <td style={{ fontSize: 12 }}>{BETROFFENEN_RECHT[anfrage.right] ?? anfrage.right}</td>
                      <td>
                        {anfrage.employeeId
                          ? <Link href={`/mitarbeiter/${anfrage.employeeId}/datenschutz`}>{anfrage.subjectName}</Link>
                          : anfrage.subjectName}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{anfrage.subjectKind}</td>
                      <td className="zahl">{formatDateDE(anfrage.receivedAt)}</td>
                      <td className="zahl">
                        {anfrage.identityCheckedAt
                          ? formatDateDE(anfrage.identityCheckedAt)
                          : <span className="marke marke-gelb">offen</span>}
                      </td>
                      <td className="zahl">
                        <span className={spaet ? 'marke marke-rot' : undefined}>{formatDateDE(frist)}</span>
                        {anfrage.extendedTo && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>verlängert</span>}
                      </td>
                      <td className="zahl">{anfrage.answeredAt ? formatDateDE(anfrage.answeredAt) : '–'}</td>
                      <td><StatusMarke status={label(ANFRAGE_STATUS, anfrage.status)} /></td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{anfrage.handledBy ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-2)', maxWidth: '68ch', lineHeight: 1.55 }}>
        Art. 12 Abs. 3 DSGVO setzt für die Beantwortung einen Monat, verlängerbar um zwei weitere.
        Die Fristen hier sind gerechnet, nicht bewertet: ob eine Verlängerung gerechtfertigt war
        und ob eine Ablehnung trägt, steht in der Begründung – nicht in der Farbe der Zeile.
      </p>
    </>
  );
}
