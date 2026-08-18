import { useState } from 'react';
import { useDaten, useJarvis } from '../lib/store.js';
import { EntwurfsDialog } from './EntwurfsDialog.js';

interface Zeile {
  nummer: number;
  zeileId: string;
  unternehmen: string;
  ansprechpartner: string | null;
  position: string | null;
  email: string | null;
  quelle: string | null;
  verifizierung: string | null;
  akquisegrund: string | null;
  mailstatus: string | null;
  letzterKontakt: string | null;
  freigabestatus: string | null;
  status: string;
  statusCode: string;
  entwurfId: string | null;
  fehler: string | null;
}

interface Kampagne {
  kampagneId: string;
  name: string;
  dienstleistung: string;
  status: string;
}

/**
 * Die Versandzentrale: eine Zeile je Unternehmen, mit genau den Spalten aus
 * dem Pflichtenheft. Mehrfachauswahl erlaubt eine gemeinsame Freigabe --
 * die dann aber ebenfalls durch den Freigabedialog muss.
 */
export function Versandzentrale(): JSX.Element {
  const jarvis = useJarvis();
  const [kampagneId, setKampagneId] = useState<string | undefined>(undefined);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [offenerEntwurf, setOffenerEntwurf] = useState<string | null>(null);

  const { daten: kampagnenAntwort } = useDaten<{ kampagnen: Kampagne[] }>({ kind: 'campaigns.list' }, { kampagnen: [] });
  const { daten: zeilen, laedt } = useDaten<Zeile[]>(
    { kind: 'campaigns.sendingCenter', ...(kampagneId ? { campaignId: kampagneId } : {}) },
    [],
  );

  const auswaehlbar = zeilen.filter((z) => z.entwurfId && z.statusCode === 'entwurf');

  const umschalten = (entwurfId: string) => {
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (neu.has(entwurfId)) neu.delete(entwurfId);
      else neu.add(entwurfId);
      return neu;
    });
  };

  const sammelfreigabe = async () => {
    if (auswahl.size === 0) return;
    const r = await jarvis.senden({ kind: 'drafts.requestBulkApproval', emailIds: [...auswahl] });
    if (r.ok) setAuswahl(new Set());
    jarvis.neuLaden();
  };

  return (
    <>
      <div className="buehne__kopf">
        <div>
          <p className="eyebrow">Akquise</p>
          <h1>Versandzentrale</h1>
        </div>
        <div className="knopfreihe">
          <select
            className="knopf"
            value={kampagneId ?? ''}
            onChange={(e) => setKampagneId(e.target.value || undefined)}
            aria-label="Kampagne wählen"
            style={{ background: 'var(--ink-2)' }}
          >
            <option value="">Alle Kampagnen</option>
            {kampagnenAntwort.kampagnen.map((k) => (
              <option key={k.kampagneId} value={k.kampagneId}>
                {k.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="knopf knopf--stark"
            onClick={sammelfreigabe}
            disabled={auswahl.size === 0 || jarvis.beschaeftigt}
          >
            {auswahl.size > 0 ? `${auswahl.size} zur Freigabe` : 'Zur Freigabe'}
          </button>
        </div>
      </div>

      {zeilen.length === 0 ? (
        <div className="leer">
          <p>{laedt ? 'Wird geladen …' : 'Noch keine Zielunternehmen.'}</p>
          {!laedt && (
            <p className="leise" style={{ fontSize: '0.9rem' }}>
              Sagen Sie zum Beispiel: „Leg eine Kampagne für Hamburger Bauunternehmen an und
              such mir 15 Firmen für unsere Baustellenbewachung.“
            </p>
          )}
        </div>
      ) : (
        <div className="tabelle__umbruch">
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ width: '2rem' }}>
                  <input
                    type="checkbox"
                    aria-label="Alle fertigen Entwürfe auswählen"
                    checked={auswahl.size > 0 && auswahl.size === auswaehlbar.length}
                    onChange={(e) =>
                      setAuswahl(e.target.checked ? new Set(auswaehlbar.map((z) => z.entwurfId!)) : new Set())
                    }
                    disabled={auswaehlbar.length === 0}
                  />
                </th>
                <th>Unternehmen</th>
                <th>Ansprechpartner</th>
                <th>E-Mail</th>
                <th>Quelle</th>
                <th>Verifizierung</th>
                <th>Akquisegrund</th>
                <th>Mailstatus</th>
                <th>Letzter Kontakt</th>
                <th>Freigabe</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.zeileId}>
                  <td>
                    {z.entwurfId && z.statusCode === 'entwurf' && (
                      <input
                        type="checkbox"
                        aria-label={`${z.unternehmen} auswählen`}
                        checked={auswahl.has(z.entwurfId)}
                        onChange={() => umschalten(z.entwurfId!)}
                      />
                    )}
                  </td>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{z.unternehmen}</strong>
                    {z.fehler && <div className="leise" style={{ fontSize: '0.78rem' }}>{z.fehler}</div>}
                  </td>
                  <td>
                    {z.ansprechpartner ?? <span className="leise">—</span>}
                    {z.position && <div className="leise" style={{ fontSize: '0.78rem' }}>{z.position}</div>}
                  </td>
                  <td>{z.email ?? <span className="leise">keine verifizierte Adresse</span>}</td>
                  <td>
                    {z.quelle ? (
                      <button
                        type="button"
                        className="knopf knopf--klein"
                        onClick={() => void jarvis.senden({ kind: 'system.openExternal', url: z.quelle! })}
                        title={z.quelle}
                      >
                        Beleg
                      </button>
                    ) : (
                      <span className="leise">—</span>
                    )}
                  </td>
                  <td>
                    <Verifizierung wert={z.verifizierung} />
                  </td>
                  <td style={{ maxWidth: '22rem' }}>
                    {z.akquisegrund ? (
                      <span className="leise" style={{ fontSize: '0.82rem' }}>{z.akquisegrund}</span>
                    ) : (
                      <span className="leise">—</span>
                    )}
                  </td>
                  <td>
                    {z.entwurfId ? (
                      <button type="button" className="knopf knopf--klein" onClick={() => setOffenerEntwurf(z.entwurfId)}>
                        {z.mailstatus ?? 'Entwurf'}
                      </button>
                    ) : (
                      <span className="merkmal">{z.status}</span>
                    )}
                  </td>
                  <td className="leise">
                    {z.letzterKontakt ? new Date(z.letzterKontakt).toLocaleDateString('de-DE') : '—'}
                  </td>
                  <td>
                    <Freigabemerkmal wert={z.freigabestatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {offenerEntwurf && <EntwurfsDialog emailId={offenerEntwurf} onSchliessen={() => setOffenerEntwurf(null)} />}
    </>
  );
}

function Verifizierung({ wert }: { wert: string | null }): JSX.Element {
  if (!wert) return <span className="leise">—</span>;
  const klasse =
    wert === 'VERIFIZIERT' ? 'merkmal merkmal--ok' : wert === 'WAHRSCHEINLICH' ? 'merkmal merkmal--warn' : 'merkmal merkmal--gefahr';
  const text = wert === 'VERIFIZIERT' ? 'Verifiziert' : wert === 'WAHRSCHEINLICH' ? 'Wahrscheinlich' : 'Nicht verifiziert';
  return <span className={klasse}>{text}</span>;
}

function Freigabemerkmal({ wert }: { wert: string | null }): JSX.Element {
  if (!wert) return <span className="leise">—</span>;
  const abbildung: Record<string, { text: string; klasse: string }> = {
    offen: { text: 'Wartet', klasse: 'merkmal merkmal--warten' },
    freigegeben: { text: 'Freigegeben', klasse: 'merkmal merkmal--ok' },
    ausgefuehrt: { text: 'Ausgeführt', klasse: 'merkmal merkmal--ok' },
    abgelehnt: { text: 'Abgelehnt', klasse: 'merkmal' },
    abgelaufen: { text: 'Abgelaufen', klasse: 'merkmal' },
    fehlgeschlagen: { text: 'Fehlgeschlagen', klasse: 'merkmal merkmal--gefahr' },
  };
  const eintrag = abbildung[wert] ?? { text: wert, klasse: 'merkmal' };
  return <span className={eintrag.klasse}>{eintrag.text}</span>;
}
