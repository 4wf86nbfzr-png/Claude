import { useState } from 'react';
import { ApprovalDialog } from '../components/ApprovalDialog.js';
import { useDaten, useJarvis, type Freigabe } from '../lib/store.js';

interface Verlaufseintrag {
  id: string;
  art: string;
  titel: string;
  status: string;
  entschiedenAm: string | null;
  entschiedenVon: string | null;
  ausgefuehrtAm: string | null;
}

/**
 * Offene Freigaben und ihr Verlauf.
 *
 * Das ist die Stelle, an der der Mensch entscheidet -- die Liste ist deshalb
 * bewusst nüchtern und vollständig, nicht auf „schnell durchklicken" optimiert.
 */
export function Freigaben(): JSX.Element {
  const jarvis = useJarvis();
  const [offen, setOffen] = useState<Freigabe | null>(null);
  const { daten: verlauf } = useDaten<Verlaufseintrag[]>({ kind: 'approvals.all', limit: 60 }, []);

  const entschieden = verlauf.filter((v) => v.status !== 'offen');

  return (
    <>
      <div className="buehne__kopf">
        <div>
          <p className="eyebrow">Kontrolle</p>
          <h1>Freigaben</h1>
        </div>
        {jarvis.freigaben.length > 0 && (
          <span className="merkmal merkmal--warten">{jarvis.freigaben.length} offen</span>
        )}
      </div>

      {jarvis.freigaben.length === 0 ? (
        <div className="leer">
          <p>Nichts wartet auf Ihre Entscheidung.</p>
          <p className="leise" style={{ fontSize: '0.9rem' }}>
            E-Mails, Löschungen und andere Aktionen nach außen tauchen hier auf, bevor sie ausgeführt werden.
          </p>
        </div>
      ) : (
        <div className="tabelle__umbruch">
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ width: '3rem' }}>Nr.</th>
                <th>Aktion</th>
                <th>Worum es geht</th>
                <th>Angefragt von</th>
                <th>Wann</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jarvis.freigaben.map((f) => (
                <tr key={f.id}>
                  <td className="leise">{f.nummer}</td>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{f.titel}</strong>
                    <div className="leise" style={{ fontSize: '0.78rem' }}>{f.art}</div>
                  </td>
                  <td style={{ maxWidth: '24rem' }}>{f.frage}</td>
                  <td className="leise">{f.angefragtVon}</td>
                  <td className="leise">{new Date(f.angefragtAm).toLocaleString('de-DE')}</td>
                  <td>
                    <button type="button" className="knopf knopf--stark knopf--klein" onClick={() => setOffen(f)}>
                      Ansehen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entschieden.length > 0 && (
        <div className="abschnitt" style={{ marginTop: '2rem' }}>
          <div className="abschnitt__kopf">
            <h2>Bereits entschieden</h2>
          </div>
          <div className="tabelle__umbruch">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Aktion</th>
                  <th>Status</th>
                  <th>Entschieden von</th>
                  <th>Wann</th>
                </tr>
              </thead>
              <tbody>
                {entschieden.map((v) => (
                  <tr key={v.id}>
                    <td>{v.titel}</td>
                    <td>
                      <span
                        className={
                          v.status === 'ausgefuehrt'
                            ? 'merkmal merkmal--ok'
                            : v.status === 'fehlgeschlagen'
                              ? 'merkmal merkmal--gefahr'
                              : 'merkmal'
                        }
                      >
                        {statusText(v.status)}
                      </span>
                    </td>
                    <td className="leise">{v.entschiedenVon ?? '—'}</td>
                    <td className="leise">
                      {v.entschiedenAm ? new Date(v.entschiedenAm).toLocaleString('de-DE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {offen && (
        <ApprovalDialog
          freigabe={offen}
          beschaeftigt={jarvis.beschaeftigt}
          onFreigeben={async () => {
            await jarvis.freigeben(offen.id);
            setOffen(null);
          }}
          onAblehnen={async () => {
            await jarvis.ablehnen(offen.id);
            setOffen(null);
          }}
          onSchliessen={() => setOffen(null)}
        />
      )}
    </>
  );
}

function statusText(code: string): string {
  const abbildung: Record<string, string> = {
    offen: 'Wartet',
    freigegeben: 'Freigegeben',
    abgelehnt: 'Abgelehnt',
    abgelaufen: 'Abgelaufen',
    ausgefuehrt: 'Ausgeführt',
    fehlgeschlagen: 'Fehlgeschlagen',
  };
  return abbildung[code] ?? code;
}
