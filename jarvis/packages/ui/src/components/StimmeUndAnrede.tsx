import { useEffect, useState } from 'react';
import { bessereStimmeVerfuegbar, waehleStimme } from '@jarvis/core/stimmwahl';
import { setStimme, sprich } from '../lib/voice.js';
import { useDaten, useJarvis } from '../lib/store.js';

/**
 * Wie JARVIS heißt, wie er einen nennt und womit er spricht.
 *
 * Die Anrede ist eine Einstellung und keine Konstante im Code — „Master"
 * gefällt nicht jedem, und manche wollen gar nicht angesprochen werden.
 *
 * Bei der Stimme ist der wichtigste Hinweis der, dass es überhaupt bessere
 * gibt: macOS liefert ab Werk die kompakte Fassung aus, und die klingt nach
 * 2005. Die guten Stimmen sind ein Systemdownload, kein Programmfehler.
 */
export function StimmeUndAnrede(): JSX.Element {
  const jarvis = useJarvis();
  const { daten: einstellungen, neu } = useDaten<Record<string, unknown>>({ kind: 'settings.all' }, {});

  const [stimmen, setStimmen] = useState<SpeechSynthesisVoice[]>([]);
  const [meldung, setMeldung] = useState<string | null>(null);

  const anrede = typeof einstellungen['persona.anrede'] === 'string' ? einstellungen['persona.anrede'] : 'Master';
  const stil = typeof einstellungen['persona.stil'] === 'string' ? einstellungen['persona.stil'] : 'trocken';
  const stimmName = typeof einstellungen['voice.tts.stimme'] === 'string' ? einstellungen['voice.tts.stimme'] : '';

  const [anredeEntwurf, setAnredeEntwurf] = useState(anrede);
  useEffect(() => setAnredeEntwurf(anrede), [anrede]);

  // Die Stimmenliste steht in Chromium erst nach `voiceschanged` bereit.
  useEffect(() => {
    const laden = () => setStimmen(window.speechSynthesis?.getVoices() ?? []);
    laden();
    window.speechSynthesis?.addEventListener('voiceschanged', laden);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', laden);
  }, []);

  const deutsche = stimmen.filter((s) => s.lang.toLowerCase().startsWith('de'));
  const automatisch = waehleStimme(stimmen, { sprache: 'de-DE' });
  const ratZuBesserer = bessereStimmeVerfuegbar(stimmen, 'de-DE');

  const setzen = async (schluessel: string, wert: string) => {
    const r = await jarvis.senden({ kind: 'settings.set', key: schluessel, value: wert });
    setMeldung(r.ok ? 'Gespeichert.' : r.error.message);
    neu();
  };

  return (
    <div className="abschnitt">
      <div className="abschnitt__kopf">
        <h2>Stimme und Anrede</h2>
      </div>

      <div className="schnips__details" style={{ borderTop: 0, paddingTop: 0 }}>
        <label className="schnips__feld">
          <span className="feld__label">Anrede</span>
          <input
            className="eingabe__feld"
            style={{ maxWidth: '18rem' }}
            value={anredeEntwurf}
            placeholder="leer lassen für keine Anrede"
            onChange={(e) => setAnredeEntwurf(e.target.value)}
            onBlur={() => anredeEntwurf !== anrede && void setzen('persona.anrede', anredeEntwurf)}
          />
        </label>
        <p className="leise" style={{ marginTop: 0, fontSize: '0.8rem' }}>
          So spricht JARVIS Sie an — zur Begrüßung, nicht in jedem Satz.
        </p>

        <label className="schnips__feld">
          <span className="feld__label">Tonfall</span>
          <select value={stil} onChange={(e) => void setzen('persona.stil', e.target.value)}>
            <option value="trocken">trocken — höflich, mit gelegentlicher Spitze</option>
            <option value="knapp">knapp — sachlich, ohne Ausschmückung</option>
            <option value="warm">warm — freundlich und zugewandt</option>
          </select>
        </label>

        <label className="schnips__feld">
          <span className="feld__label">Stimme</span>
          <select value={stimmName} onChange={(e) => {
            setStimme(e.target.value || null);
            void setzen('voice.tts.stimme', e.target.value);
          }}>
            <option value="">
              automatisch{automatisch ? ` — zurzeit ${automatisch.name}` : ''}
            </option>
            {deutsche.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="schnips__reihe">
          <button
            type="button"
            className="knopf knopf--klein"
            onClick={() =>
              sprich(
                `${anredeEntwurf ? `${anredeEntwurf}, ` : ''}so klinge ich. Eine Sache wartet noch auf Ihre Freigabe.`,
                { unterbrechen: true },
              )
            }
          >
            Probe hören
          </button>
          {meldung && <span className="leise">{meldung}</span>}
        </div>

        {ratZuBesserer && (
          <p className="hinweis hinweis--warn">
            Es ist nur die einfache Systemstimme installiert — die klingt blechern. Deutlich
            besser wird es mit einer nachgeladenen Stimme: <strong>Systemeinstellungen →
            Bedienungshilfen → Gesprochene Inhalte → Systemstimme → Anpassen</strong>, dort eine
            deutsche Stimme mit dem Zusatz „Premium" oder „Erweitert" laden. Danach JARVIS neu
            starten; sie erscheint dann in der Liste oben.
          </p>
        )}

        <p className="leise" style={{ fontSize: '0.8rem' }}>
          Die Stimmen des Systems sprechen auf diesem Gerät — es geht nichts ins Netz. Wer eine
          wirklich menschliche Stimme möchte, kann einen Anbieter hinterlegen
          (<code>JARVIS_TTS_PROVIDER</code>); dann verlässt der zu sprechende Text den Rechner.
        </p>
      </div>
    </div>
  );
}
