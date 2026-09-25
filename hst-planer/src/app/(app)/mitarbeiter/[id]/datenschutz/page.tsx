import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { formatDateDE } from '@/lib/time';
import { ANFRAGE_STATUS, BETROFFENEN_RECHT, DOCUMENT_TYPE, label } from '@/lib/status';
import { Gesperrt, Hinweis, Karte, Leer, Paar, StatusMarke } from '@/components/ui';
import { BesondereKategorieAnlegen, InhaltAnfordern } from './formular';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Datenschutz' };

/**
 * Reiter „Datenschutz" der Mitarbeiterakte (SecPlan 5, 9–17).
 *
 * Eingeschränkt: nur wer Personalakten führt, kommt hierher. Der Reiter
 * beantwortet vier Fragen an einem Ort:
 *   – Welche besonderen Kategorien liegen vor (Art. 9 DSGVO)?
 *   – Welche Fristen laufen, wann wird gelöscht?
 *   – Wer hat auf die Unterlagen dieser Person zugegriffen?
 *   – Gibt es offene Betroffenenanfragen?
 *
 * Inhalte besonderer Kategorien werden hier NICHT angezeigt, nur ihr
 * Vorhandensein, die Rechtsgrundlage und die Frist. Für den Inhalt
 * braucht es eine eigene Freigabe, die dieses System nicht vergibt.
 */
export default async function AkteDatenschutz({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('employees.file');
  const { id } = await params;

  const employee = await db.employee.findFirst({
    where: { id, ...employeeFilter(user) },
    select: { id: true, firstName: true, lastName: true, createdAt: true, deletedAt: true, active: true },
  });
  if (!employee) notFound();

  const darfBesondere = can(user.role, 'employees.sensitive');

  const [besondere, dokumente, zugriffe, anfragen, regeln] = await Promise.all([
    db.employeeSensitive.findMany({
      where: { employeeId: id },
      select: { id: true, category: true, lawfulBasis: true, validUntil: true, deleteAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.document.findMany({
      where: { employeeId: id, deletedAt: null },
      select: {
        id: true, title: true, type: true, specialCategory: true, deleteAt: true, access: true,
        retentionRule: { select: { category: true, months: true, startsFrom: true, keepReason: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.documentAccessLog.findMany({
      where: { document: { employeeId: id } },
      select: {
        id: true, action: true, result: true, reason: true, createdAt: true, userId: true, role: true,
        document: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.dataSubjectRequest.findMany({
      where: { employeeId: id },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    }),
    db.retentionRule.findMany({
      where: { deletedAt: null },
      select: { id: true, category: true, months: true, startsFrom: true, keepReason: true, status: true },
      orderBy: { category: 'asc' },
    }),
  ]);

  const benutzer = await db.user.findMany({
    where: { id: { in: [...new Set(zugriffe.map((z) => z.userId).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, name: true },
  });
  const nameVon = new Map(benutzer.map((u) => [u.id, u.name]));

  const heute = new Date();
  const ohneFrist = dokumente.filter((d) => !d.deleteAt && !d.retentionRule);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Hinweis art="warnung">
        Dieser Reiter zeigt, welche Daten zu dieser Person geführt werden und wie lange – nicht
        deren Inhalt. Ob die eingetragenen Rechtsgrundlagen tragen, ist eine rechtliche Frage;
        das System prüft sie nicht und trägt von sich aus keine ein.
      </Hinweis>

      <Karte titel="Besondere Kategorien nach Art. 9 DSGVO">
        {!darfBesondere ? (
          <div style={{ padding: 12 }}>
            <Paar label="Einträge">
              <Gesperrt grund="Besondere Kategorien – gesonderte Freigabe erforderlich" />
            </Paar>
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
              {besondere.length === 0
                ? 'Für diese Person ist nichts dieser Art hinterlegt.'
                : `Für diese Person ${besondere.length === 1 ? 'ist ein Eintrag' : `sind ${besondere.length} Einträge`} hinterlegt. Der Inhalt ist für Ihre Rolle nicht freigegeben.`}
            </p>
          </div>
        ) : besondere.length === 0 ? (
          <Leer>Keine Daten besonderer Kategorien hinterlegt – so soll es im Regelfall bleiben.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Kategorie</th><th>Rechtsgrundlage</th><th>Erfasst</th><th>Gültig bis</th><th>Löschdatum</th><th>Inhalt</th></tr></thead>
              <tbody>
                {besondere.map((eintrag) => (
                  <tr key={eintrag.id} className="zeile-beige">
                    <td>{eintrag.category}</td>
                    <td style={{ fontSize: 12 }}>
                      {eintrag.lawfulBasis
                        ? eintrag.lawfulBasis
                        : <span className="marke marke-rot">nicht eingetragen</span>}
                    </td>
                    <td className="zahl">{formatDateDE(eintrag.createdAt)}</td>
                    <td className="zahl">{eintrag.validUntil ? formatDateDE(eintrag.validUntil) : '–'}</td>
                    <td className="zahl">
                      {eintrag.deleteAt
                        ? <span className={eintrag.deleteAt <= heute ? 'marke marke-rot' : undefined}>{formatDateDE(eintrag.deleteAt)}</span>
                        : <span className="marke marke-gelb">offen</span>}
                    </td>
                    <td><InhaltAnfordern id={eintrag.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {darfBesondere && (
          <div className="karte-fuss">
            <BesondereKategorieAnlegen employeeId={employee.id} />
          </div>
        )}
      </Karte>

      <Karte titel="Fristen der hinterlegten Unterlagen"
             aktion={<Link href="/compliance/loeschfristen" className="knopf knopf-klein">Löschkonzept</Link>}>
        {dokumente.length === 0 ? <Leer>Keine Unterlagen hinterlegt.</Leer> : (
          <>
            {ohneFrist.length > 0 && (
              <div style={{ padding: '8px 12px' }}>
                <Hinweis art="warnung">
                  {ohneFrist.length} {ohneFrist.length === 1 ? 'Unterlage hat' : 'Unterlagen haben'} weder
                  ein Löschdatum noch eine Regel aus dem Löschkonzept. Ohne Frist wird nichts gelöscht.
                </Hinweis>
              </div>
            )}
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead>
                  <tr><th>Unterlage</th><th>Typ</th><th>Kategorie im Löschkonzept</th><th>Frist</th><th>Fristbeginn</th><th>Aufbewahrungsgrund</th><th>Löschdatum</th></tr>
                </thead>
                <tbody>
                  {dokumente.map((dokument) => (
                    <tr key={dokument.id} className={!dokument.deleteAt && !dokument.retentionRule ? 'zeile-gelb' : undefined}>
                      <td>
                        {dokument.title}
                        {dokument.specialCategory && <span className="marke marke-beige" style={{ marginLeft: 5 }}>Art. 9</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>{DOCUMENT_TYPE[dokument.type] ?? dokument.type}</td>
                      <td style={{ fontSize: 12 }}>{dokument.retentionRule?.category ?? <span className="marke marke-gelb">keine Regel</span>}</td>
                      <td className="zahl">{dokument.retentionRule ? `${dokument.retentionRule.months} Mon.` : '–'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{dokument.retentionRule?.startsFrom ?? '–'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{dokument.retentionRule?.keepReason ?? '–'}</td>
                      <td className="zahl">{dokument.deleteAt ? formatDateDE(dokument.deleteAt) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Karte>

      <Karte titel={`Zugriffe auf Unterlagen dieser Person (${zugriffe.length})`}>
        {zugriffe.length === 0 ? <Leer>Bisher hat niemand eine Unterlage dieser Person abgerufen.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Rolle</th><th>Unterlage</th><th>Vorgang</th><th>Ergebnis</th></tr></thead>
              <tbody>
                {zugriffe.map((zugriff) => (
                  <tr key={zugriff.id} className={zugriff.result === 'VERWEIGERT' ? 'zeile-rot' : undefined}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(zugriff.createdAt)}</td>
                    <td>{zugriff.userId ? nameVon.get(zugriff.userId) ?? 'gelöschtes Konto' : 'ohne Anmeldung'}</td>
                    <td style={{ fontSize: 11 }}>{zugriff.role ?? '–'}</td>
                    <td style={{ fontSize: 12 }}>{zugriff.document.title}</td>
                    <td style={{ fontSize: 12 }}>{zugriff.action.toLowerCase()}</td>
                    <td>
                      {zugriff.result === 'GEWAEHRT'
                        ? <span className="marke marke-gruen">gewährt</span>
                        : <span className="marke marke-rot" title={zugriff.reason ?? undefined}>verweigert</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <Karte titel="Betroffenenanfragen"
             aktion={<Link href="/compliance/datenschutz" className="knopf knopf-klein">Alle Anfragen</Link>}>
        {anfragen.length === 0 ? <Leer>Diese Person hat noch kein Betroffenenrecht geltend gemacht.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Nummer</th><th>Recht</th><th>Eingang</th><th>Frist</th><th>Status</th></tr></thead>
              <tbody>
                {anfragen.map((anfrage) => (
                  <tr key={anfrage.id}>
                    <td className="zahl">{anfrage.number}</td>
                    <td style={{ fontSize: 12 }}>{BETROFFENEN_RECHT[anfrage.right] ?? anfrage.right}</td>
                    <td className="zahl">{formatDateDE(anfrage.receivedAt)}</td>
                    <td className="zahl">{formatDateDE(anfrage.extendedTo ?? anfrage.dueAt)}</td>
                    <td><StatusMarke status={label(ANFRAGE_STATUS, anfrage.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
        Im Löschkonzept sind derzeit {regeln.length} Kategorien geführt, davon{' '}
        {regeln.filter((r) => r.status === 'RECHTLICH_GEPRUEFT').length} rechtlich geprüft.{' '}
        <Link href="/compliance/loeschfristen">Zum Löschkonzept</Link>
      </p>
    </div>
  );
}
