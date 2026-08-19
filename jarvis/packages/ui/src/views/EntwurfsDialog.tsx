import { useEffect, useState } from 'react';
import { useJarvis } from '../lib/store.js';
import { schweig, sprich } from '../lib/voice.js';

interface Entwurf {
  id: string;
  firma: string | null;
  an: string;
  betreff: string;
  text: string;
  status: string;
  statusCode: string;
  warnungen: Array<{ code: string; message: string }>;
  fehler: string | null;
  gesendetAm: string | null;
}

/**
 * Entwurf ansehen, ändern, vorlesen und zur Freigabe stellen.
 *
 * Wichtig: „Zur Freigabe stellen" versendet nichts. Es legt die Anfrage an;
 * entschieden wird im Freigabedialog.
 */
export function EntwurfsDialog({ emailId, onSchliessen }: { emailId: string; onSchliessen: () => void }): JSX.Element {
  const jarvis = useJarvis();
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [betreff, setBetreff] = useState('');
  const [text, setText] = useState('');
  const [an, setAn] = useState('');
  const [geaendert, setGeaendert] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'gefahr'; text: string } | null>(null);
  const [liest, setLiest] = useState(false);

  useEffect(() => {
    void jarvis.senden({ kind: 'drafts.get', emailId }).then((r) => {
      if (!r.ok) {
        setMeldung({ art: 'gefahr', text: r.error.message });
        return;
      }
      const d = r.data as Entwurf;
      setEntwurf(d);
      setBetreff(d.betreff);
      setText(d.text);
      setAn(d.an);
      setGeaendert(false);
    });
  }, [emailId, jarvis]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        schweig();
        onSchliessen();
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onSchliessen]);

  const speichern = async () => {
    const r = await jarvis.senden({ kind: 'drafts.update', emailId, patch: { to: an, subject: betreff, body: text } });
    if (!r.ok) {
      setMeldung({ art: 'gefahr', text: r.error.message });
      return false;
    }
    setGeaendert(false);
    setMeldung({ art: 'ok', text: 'Gespeichert. Eine frühere Freigabe gilt damit nicht mehr.' });
    jarvis.neuLaden();
    return true;
  };

  const zurFreigabe = async () => {
    if (geaendert && !(await speichern())) return;
    const r = await jarvis.senden({ kind: 'drafts.requestApproval', emailId });
    if (!r.ok) {
      setMeldung({ art: 'gefahr', text: `${r.error.message}${r.error.hint ? ` — ${r.error.hint}` : ''}` });
      return;
    }
    jarvis.neuLaden();
    onSchliessen();
  };

  const vorlesen = async () => {
    if (liest) {
      schweig();
      setLiest(false);
      return;
    }
    const r = await jarvis.senden({ kind: 'drafts.spoken', emailId });
    if (r.ok) {
      sprich(String(r.data), { unterbrechen: true });
      setLiest(true);
    }
  };

  const gesendet = entwurf?.statusCode === 'gesendet';

  return (
    <div className="schleier" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onSchliessen()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="E-Mail-Entwurf">
        <p className="eyebrow">{entwurf?.firma ?? 'E-Mail'}</p>
        <h2>{gesendet ? 'Gesendete Nachricht' : 'Entwurf'}</h2>

        {!entwurf && <p className="leise">Wird geladen …</p>}

        {entwurf && (
          <>
            {entwurf.warnungen.length > 0 && (
              <div style={{ margin: '1rem 0' }}>
                {entwurf.warnungen.map((w) => (
                  <p key={w.code} className="hinweis hinweis--warn">
                    {w.message}
                  </p>
                ))}
              </div>
            )}
            {entwurf.fehler && <p className="hinweis hinweis--gefahr">{entwurf.fehler}</p>}

            <div className="feld" style={{ marginTop: '1.25rem' }}>
              <label className="feld__label" htmlFor="entwurf-an">
                Empfänger
              </label>
              <input
                id="entwurf-an"
                type="text"
                value={an}
                readOnly={gesendet}
                onChange={(e) => {
                  setAn(e.target.value);
                  setGeaendert(true);
                }}
              />
            </div>

            <div className="feld">
              <label className="feld__label" htmlFor="entwurf-betreff">
                Betreff
              </label>
              <input
                id="entwurf-betreff"
                type="text"
                value={betreff}
                readOnly={gesendet}
                onChange={(e) => {
                  setBetreff(e.target.value);
                  setGeaendert(true);
                }}
              />
            </div>

            <div className="feld">
              <label className="feld__label" htmlFor="entwurf-text">
                Mailtext
              </label>
              <textarea
                id="entwurf-text"
                rows={14}
                value={text}
                readOnly={gesendet}
                onChange={(e) => {
                  setText(e.target.value);
                  setGeaendert(true);
                }}
                style={{ fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>

            {meldung && (
              <p className={`hinweis hinweis--${meldung.art === 'ok' ? 'ok' : 'gefahr'}`}>{meldung.text}</p>
            )}

            {gesendet && entwurf.gesendetAm && (
              <p className="leise" style={{ fontSize: '0.85rem' }}>
                Versendet am {new Date(entwurf.gesendetAm).toLocaleString('de-DE')}.
              </p>
            )}

            <div className="dialog__aktionen">
              <button type="button" className="knopf" onClick={vorlesen}>
                {liest ? 'Vorlesen stoppen' : 'Vorlesen'}
              </button>
              <button type="button" className="knopf" onClick={onSchliessen}>
                Schließen
              </button>
              {!gesendet && (
                <>
                  <button type="button" className="knopf" onClick={speichern} disabled={!geaendert}>
                    Speichern
                  </button>
                  <button type="button" className="knopf knopf--stark" onClick={zurFreigabe}>
                    Zur Freigabe stellen
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
