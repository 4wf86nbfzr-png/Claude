import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE, toDateOnly } from '@/lib/time';
import { DOCUMENT_TYPE } from '@/lib/status';
import { Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { eigenesDokumentAktion } from './actions';

export const metadata: Metadata = { title: 'Meine Dokumente' };
export const dynamic = 'force-dynamic';

export default async function MeineDokumente() {
  const user = await seite('self.documents');
  if (!user.employeeId) {
    return (
      <>
        <Seitenkopf titel="Meine Dokumente" />
        <Hinweis art="info">Ihr Zugang ist keinem Mitarbeiterprofil zugeordnet.</Hinweis>
      </>
    );
  }

  const heute = toDateOnly(new Date());
  const [dokumente, qualifikationen] = await Promise.all([
    db.document.findMany({
      where: { employeeId: user.employeeId, deletedAt: null, visibleToEmployee: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.employeeQualification.findMany({
      where: { employeeId: user.employeeId },
      include: { qualification: { select: { name: true } } },
      orderBy: { expiresAt: 'asc' },
    }),
  ]);

  const ablaufend = qualifikationen.filter((q) => q.expiresAt && q.expiresAt < new Date(heute.getTime() + 60 * 86400000));

  return (
    <>
      <Seitenkopf titel="Meine Dokumente" unter="Nachweise hochladen und den eigenen Stand sehen" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
        {ablaufend.length > 0 && (
          <Hinweis art="warnung">
            Diese Nachweise laufen bald ab oder sind abgelaufen:{' '}
            {ablaufend.map((q) => `${q.qualification.name} (${q.expiresAt ? formatDateDE(q.expiresAt) : 'ohne Datum'})`).join(', ')}.
            Bitte laden Sie den neuen Nachweis hier hoch.
          </Hinweis>
        )}

        <Karte titel="Nachweis hochladen">
          <div style={{ padding: 16 }}>
            <AktionsFormular aktion={eigenesDokumentAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="feld-gruppe">
                <span className="feld-label">Art des Dokuments</span>
                <select name="typ" className="feld" defaultValue="FUEHRUNGSZEUGNIS">
                  <option value="FUEHRUNGSZEUGNIS">{DOCUMENT_TYPE.FUEHRUNGSZEUGNIS}</option>
                  <option value="AUSWEIS">{DOCUMENT_TYPE.AUSWEIS}</option>
                  <option value="SCHULUNGSNACHWEIS">{DOCUMENT_TYPE.SCHULUNGSNACHWEIS}</option>
                  <option value="SONSTIGES">{DOCUMENT_TYPE.SONSTIGES}</option>
                </select>
              </label>
              <label className="feld-gruppe">
                <span className="feld-label">Bezeichnung (freiwillig)</span>
                <input name="titel" className="feld" placeholder="leer lassen = Dateiname" />
              </label>
              <label className="feld-gruppe">
                <span className="feld-label">Gültig bis (falls angegeben)</span>
                <input name="gueltigBis" type="date" className="feld" />
              </label>
              <label className="feld-gruppe">
                <span className="feld-label">Datei</span>
                <input name="datei" type="file" className="feld" required style={{ height: 'auto', padding: 8 }}
                       accept=".pdf,.jpg,.jpeg,.png,.webp" />
                <span className="feld-hinweis">PDF oder Foto, bis 20 MB. Ein gut lesbares Handyfoto reicht.</span>
              </label>
              <div><AktionsKnopf klasse="knopf knopf-primaer knopf-gross" laufend="Wird hochgeladen …">Hochladen</AktionsKnopf></div>
            </AktionsFormular>
          </div>
        </Karte>

        <Karte titel="Bereits hinterlegt">
          {dokumente.length === 0 ? <Leer>Sie haben noch keine Dokumente hochgeladen.</Leer> : (
            <table className="tabelle">
              <thead><tr><th>Dokument</th><th>Art</th><th>Gültig bis</th><th>Hochgeladen</th></tr></thead>
              <tbody>
                {dokumente.map((dokument) => (
                  <tr key={dokument.id} className={dokument.expiresAt && dokument.expiresAt < heute ? 'zeile-rot' : undefined}>
                    <td><a href={`/api/dokumente/${dokument.id}`}>{dokument.title}</a></td>
                    <td style={{ fontSize: 12 }}>{DOCUMENT_TYPE[dokument.type] ?? dokument.type}</td>
                    <td className="zahl">{dokument.expiresAt ? formatDateDE(dokument.expiresAt) : '–'}</td>
                    <td className="zahl" style={{ fontSize: 12, color: 'var(--text-2)' }}>{formatDateDE(dokument.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Karte>

        <Karte titel="Meine Qualifikationen">
          {qualifikationen.length === 0 ? <Leer>Es sind keine Qualifikationen hinterlegt.</Leer> : (
            <table className="tabelle">
              <thead><tr><th>Qualifikation</th><th>Gültig bis</th></tr></thead>
              <tbody>
                {qualifikationen.map((q) => {
                  const abgelaufen = q.expiresAt && q.expiresAt < heute;
                  return (
                    <tr key={q.id}>
                      <td>{q.qualification.name}</td>
                      <td>
                        {q.expiresAt
                          ? <span className={`marke marke-${abgelaufen ? 'rot' : 'gruen'}`}>{formatDateDE(q.expiresAt)}</span>
                          : <span className="marke marke-gruen">unbefristet</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Karte>
      </div>
    </>
  );
}
