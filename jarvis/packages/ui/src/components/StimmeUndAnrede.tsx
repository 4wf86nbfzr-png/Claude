import { useEffect, useState } from 'react';
import { bessereStimmeVerfuegbar, stimmlageVon, waehleStimme, type Stimmlage } from '@jarvis/core/stimmwahl';
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
interface SttZustand {
  provider: string;
  bereit: boolean;
  hinweis: string | null;
}

type Einrichtungsergebnis =
  | { fehler: string; hinweis: string | null }
  | {
      modell: string;
      ladeMs: number;
      probeHinweis: string | null;
      probe: null | {
        gesprochen: string;
        erkannt: string;
        quote: number;
        dauerMs: number;
        faktorEchtzeit: number;
        werkzeug: string;
      };
    };

export function StimmeUndAnrede(): JSX.Element {
  const jarvis = useJarvis();
  const { daten: einstellungen, neu } = useDaten<Record<string, unknown>>({ kind: 'settings.all' }, {});

  const [stimmen, setStimmen] = useState<SpeechSynthesisVoice[]>([]);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [erkennung, setErkennung] = useState<SttZustand | null>(null);
  const [richtetEin, setRichtetEin] = useState(false);
  const [ergebnis, setErgebnis] = useState<Einrichtungsergebnis | null>(null);

  const sttLaden = () =>
    void jarvis.senden({ kind: 'voice.status' }).then((r) => {
      if (r.ok) setErkennung((r.data as { stt: SttZustand }).stt);
    });
  useEffect(sttLaden, []); // eslint-disable-line react-hooks/exhaustive-deps

  const einrichten = async () => {
    setRichtetEin(true);
    setErgebnis(null);
    const r = await jarvis.senden({ kind: 'voice.setupLocal' });
    setRichtetEin(false);
    if (!r.ok) {
      setErgebnis({ fehler: r.error.message, hinweis: r.error.hint ?? null });
      return;
    }
    setErgebnis(r.data as Einrichtungsergebnis);
    sttLaden();
  };

  const anrede = typeof einstellungen['persona.anrede'] === 'string' ? einstellungen['persona.anrede'] : 'Master';
  const stil = typeof einstellungen['persona.stil'] === 'string' ? einstellungen['persona.stil'] : 'trocken';
  const stimmName = typeof einstellungen['voice.tts.stimme'] === 'string' ? einstellungen['voice.tts.stimme'] : '';
  const lage: Stimmlage =
    einstellungen['voice.tts.lage'] === 'weiblich' || einstellungen['voice.tts.lage'] === 'egal'
      ? einstellungen['voice.tts.lage']
      : 'maennlich';

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
  const automatisch = waehleStimme(stimmen, { sprache: 'de-DE', lage });

  // Die Auswahl im Fenster sofort wirksam machen, nicht erst nach Neustart.
  useEffect(() => setStimme(stimmName || null, lage), [stimmName, lage]);
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

      {/* --- Zuhören ---------------------------------------------------- */}
      <div className="schnips__details" style={{ borderTop: 0, paddingTop: 0, marginBottom: 'var(--gap-m)' }}>
        <div className="schnips__reihe">
          <span className="feld__label">Spracherkennung</span>
          <span className={`merkmal ${erkennung?.bereit ? 'merkmal--ok' : 'merkmal--warn'}`}>
            {erkennung ? (erkennung.bereit ? 'einsatzbereit' : 'nicht eingerichtet') : 'wird geprüft …'}
          </span>
          {!erkennung?.bereit && (
            <button type="button" className="knopf knopf--stark" onClick={() => void einrichten()} disabled={richtetEin}>
              {richtetEin ? 'Wird geladen …' : 'Spracherkennung einrichten'}
            </button>
          )}
          {erkennung?.bereit && (
            <button type="button" className="knopf knopf--klein" onClick={() => void einrichten()} disabled={richtetEin}>
              {richtetEin ? 'Prüft …' : 'Nochmal prüfen'}
            </button>
          )}
        </div>

        {!erkennung?.bereit && !richtetEin && !ergebnis && (
          <p className="leise" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Einmalig rund 490 MB. Danach hört JARVIS auf diesem Gerät zu — ohne Schlüssel und
            ohne dass Ton den Rechner verlässt. Am Ende wird geprüft: Ihr Mac spricht einen
            Satz, die Erkennung hört zu, und Sie sehen, was ankam.
          </p>
        )}

        {richtetEin && (
          <p className="leise" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Der Fortschritt steht in der Statuszeile links oben. Beim ersten Mal dauert es
            einige Minuten — das Fenster darf offen bleiben.
          </p>
        )}

        {ergebnis && 'fehler' in ergebnis && (
          <p className="hinweis hinweis--warn">
            {ergebnis.fehler}
            {ergebnis.hinweis ? ` — ${ergebnis.hinweis}` : ''}
          </p>
        )}

        {ergebnis && !('fehler' in ergebnis) && (
          <div className="hinweis">
            {ergebnis.probe ? (
              <>
                <p style={{ margin: 0 }}>
                  Gesprochen ({ergebnis.probe.werkzeug}): „{ergebnis.probe.gesprochen}"
                </p>
                <p style={{ margin: '0.35rem 0 0' }}>
                  Verstanden: „{ergebnis.probe.erkannt || '— nichts —'}"
                </p>
                <p style={{ margin: '0.35rem 0 0' }}>
                  Übereinstimmung <strong>{Math.round(ergebnis.probe.quote * 100)} %</strong> ·{' '}
                  {ergebnis.probe.faktorEchtzeit < 0.4
                    ? 'flüssig'
                    : ergebnis.probe.faktorEchtzeit < 1
                      ? 'merklich, aber brauchbar'
                      : 'zu langsam für ein Gespräch'}{' '}
                  ({ergebnis.probe.faktorEchtzeit.toFixed(2)}× Echtzeit)
                  {ergebnis.probe.quote < 0.4 && ' — bitte ein größeres Modell wählen.'}
                </p>
              </>
            ) : (
              <p style={{ margin: 0 }}>
                Modell geladen. {ergebnis.probeHinweis ?? ''} Ob es gut versteht, zeigt sich im
                Gespräch.
              </p>
            )}
          </div>
        )}
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
          <span className="feld__label">Stimmlage</span>
          <select value={lage} onChange={(e) => void setzen('voice.tts.lage', e.target.value)}>
            <option value="maennlich">männlich</option>
            <option value="weiblich">weiblich</option>
            <option value="egal">egal — nimm die beste</option>
          </select>
        </label>

        <label className="schnips__feld">
          <span className="feld__label">Stimme</span>
          <select value={stimmName} onChange={(e) => {
            setStimme(e.target.value || null, lage);
            void setzen('voice.tts.stimme', e.target.value);
          }}>
            <option value="">
              automatisch{automatisch ? ` — zurzeit ${automatisch.name}` : ''}
            </option>
            {deutsche.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {stimmlageVon(s.name) === 'maennlich' ? ' — männlich' : ''}
                {stimmlageVon(s.name) === 'weiblich' ? ' — weiblich' : ''}
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
