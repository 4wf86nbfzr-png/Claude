import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { AVAILABILITY_KIND, label } from '@/lib/status';
import { Hinweis, Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { verfuegbarkeitAktion, verfuegbarkeitLoeschenAktion } from '../mitarbeiter/actions';

export const metadata: Metadata = { title: 'Meine Verfügbarkeit' };
export const dynamic = 'force-dynamic';

export default async function MeineVerfuegbarkeit() {
  const user = await seite('self.availability');
  if (!user.employeeId) {
    return (
      <>
        <Seitenkopf titel="Meine Verfügbarkeit" />
        <Hinweis art="info">Ihr Zugang ist keinem Mitarbeiterprofil zugeordnet.</Hinweis>
      </>
    );
  }

  const eintraege = await db.availability.findMany({
    where: { employeeId: user.employeeId, to: { gte: new Date(Date.now() - 30 * 86400000) } },
    orderBy: { from: 'asc' },
  });

  return (
    <>
      <Seitenkopf titel="Meine Verfügbarkeit"
                  unter="Tragen Sie hier ein, wann Sie nicht können – oder wann Sie besonders gern eingeplant werden möchten." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}>
        <Karte titel="Neuer Eintrag">
          <div style={{ padding: 16 }}>
            <AktionsFormular aktion={verfuegbarkeitAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="hidden" name="employeeId" value={user.employeeId} />
              <label className="feld-gruppe">
                <span className="feld-label">Art</span>
                <select name="art" className="feld">
                  <option value="NICHT_VERFUEGBAR">Ich kann nicht</option>
                  <option value="URLAUB">Urlaub</option>
                  <option value="KRANK">Krank</option>
                  <option value="VERFUEGBAR">Ich kann</option>
                  <option value="BEVORZUGT">Bevorzugt einsetzbar</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="feld-gruppe" style={{ flex: '1 1 140px' }}>
                  <span className="feld-label">Von</span>
                  <input name="von" type="date" className="feld" required />
                </label>
                <label className="feld-gruppe" style={{ flex: '1 1 140px' }}>
                  <span className="feld-label">Bis</span>
                  <input name="bis" type="date" className="feld" />
                </label>
              </div>
              <label className="feld-gruppe">
                <span className="feld-label">Notiz (freiwillig)</span>
                <input name="notiz" className="feld" placeholder="z. B. Prüfung, Familienfeier" />
              </label>
              <div><AktionsKnopf klasse="knopf knopf-primaer">Eintragen</AktionsKnopf></div>
            </AktionsFormular>
          </div>
        </Karte>

        <Karte titel="Meine Einträge">
          {eintraege.length === 0 ? <Leer>Noch keine Einträge.</Leer> : (
            <table className="tabelle">
              <thead><tr><th>Art</th><th>Von</th><th>Bis</th><th>Notiz</th><th style={{ width: 1 }} /></tr></thead>
              <tbody>
                {eintraege.map((eintrag) => (
                  <tr key={eintrag.id}>
                    <td><StatusMarke status={label(AVAILABILITY_KIND, eintrag.kind)} /></td>
                    <td className="zahl">{formatDateDE(eintrag.from)}</td>
                    <td className="zahl">{formatDateDE(eintrag.to)}</td>
                    <td style={{ color: 'var(--text-2)' }}>{eintrag.note ?? '–'}</td>
                    <td>
                      <AktionsFormular aktion={verfuegbarkeitLoeschenAktion} meldungOben={false}>
                        <input type="hidden" name="id" value={eintrag.id} />
                        <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                      </AktionsFormular>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Karte>
      </div>
    </>
  );
}
