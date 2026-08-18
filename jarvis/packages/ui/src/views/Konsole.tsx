import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceOrb } from '../components/VoiceOrb.js';
import { useJarvis } from '../lib/store.js';
import { spracherkennungVerfuegbar, starteDiktat, type Diktat } from '../lib/voice.js';

/**
 * Die Hauptansicht: Orb, Statuszeile, Verlauf, Eingabe.
 *
 * Bedienung per Sprache und per Tastatur gleichwertig -- die Leertaste hält
 * das Mikrofon offen, solange sie gedrückt ist (wie eine Sprechtaste), und
 * ein Klick auf den Orb schaltet dauerhaft um.
 */
export function Konsole(): JSX.Element {
  const jarvis = useJarvis();
  const [entwurf, setEntwurf] = useState('');
  const [pegel, setPegel] = useState(0);
  const [hoert, setHoert] = useState(false);
  const [zwischentext, setZwischentext] = useState('');
  const [sprachfehler, setSprachfehler] = useState<string | null>(null);

  const diktatRef = useRef<Diktat | null>(null);
  const verlaufRef = useRef<HTMLDivElement>(null);
  const feldRef = useRef<HTMLTextAreaElement>(null);
  const pegelTimer = useRef<number | null>(null);

  const verfuegbar = spracherkennungVerfuegbar();

  // Verlauf immer unten halten.
  useEffect(() => {
    verlaufRef.current?.scrollTo({ top: verlaufRef.current.scrollHeight, behavior: 'smooth' });
  }, [jarvis.beitraege.length, zwischentext]);

  const stoppeHoeren = useCallback(() => {
    diktatRef.current?.stop();
    diktatRef.current = null;
    setHoert(false);
    setPegel(0);
    setZwischentext('');
    if (pegelTimer.current) {
      window.clearInterval(pegelTimer.current);
      pegelTimer.current = null;
    }
    if (jarvis.zustand === 'LISTENING') jarvis.setZustand('IDLE');
  }, [jarvis]);

  const starteHoeren = useCallback(() => {
    if (hoert || jarvis.beschaeftigt) return;
    setSprachfehler(null);

    const diktat = starteDiktat({
      sprache: 'de-DE',
      onText: ({ text, endgueltig }) => {
        if (endgueltig) {
          setZwischentext('');
          setEntwurf((alt) => (alt ? `${alt} ${text}` : text));
        } else {
          setZwischentext(text);
        }
      },
      onFehler: (meldung) => {
        setSprachfehler(meldung);
        stoppeHoeren();
      },
      onEnde: () => stoppeHoeren(),
    });

    if (!diktat) {
      setSprachfehler('Dieses System bietet keine Spracherkennung im Fenster an. Bitte tippen.');
      return;
    }

    diktatRef.current = diktat;
    diktat.start();
    setHoert(true);
    jarvis.setZustand('LISTENING');

    // Der Pegel kommt aus einem eigenen Analysator, damit der Orb sich bewegt.
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const kontext = new AudioContext();
        const analyse = kontext.createAnalyser();
        analyse.fftSize = 512;
        kontext.createMediaStreamSource(stream).connect(analyse);
        const puffer = new Uint8Array(analyse.frequencyBinCount);

        pegelTimer.current = window.setInterval(() => {
          if (!diktatRef.current) {
            for (const spur of stream.getTracks()) spur.stop();
            void kontext.close();
            return;
          }
          analyse.getByteTimeDomainData(puffer);
          let summe = 0;
          for (const wert of puffer) {
            const d = (wert - 128) / 128;
            summe += d * d;
          }
          setPegel(Math.min(1, Math.sqrt(summe / puffer.length) * 3.2));
        }, 60);
      })
      .catch(() => {
        /* Ohne Pegelanzeige funktioniert die Erkennung trotzdem. */
      });
  }, [hoert, jarvis, stoppeHoeren]);

  // Leertaste als Sprechtaste, solange man nicht im Textfeld ist.
  useEffect(() => {
    const imTextfeld = (ziel: EventTarget | null) =>
      ziel instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(ziel.tagName);

    const runter = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || imTextfeld(e.target)) return;
      e.preventDefault();
      starteHoeren();
    };
    const hoch = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || imTextfeld(e.target)) return;
      e.preventDefault();
      if (diktatRef.current) {
        stoppeHoeren();
        window.setTimeout(() => feldRef.current?.focus(), 60);
      }
    };

    window.addEventListener('keydown', runter);
    window.addEventListener('keyup', hoch);
    return () => {
      window.removeEventListener('keydown', runter);
      window.removeEventListener('keyup', hoch);
    };
  }, [starteHoeren, stoppeHoeren]);

  const absenden = () => {
    const text = entwurf.trim();
    if (!text) return;
    setEntwurf('');
    stoppeHoeren();
    void jarvis.frage(text);
  };

  const statusText = hoert ? 'LISTENING' : jarvis.zustand;

  return (
    <div className="konsole">
      <div className="orb-bereich">
        <VoiceOrb
          zustand={hoert ? 'LISTENING' : jarvis.zustand}
          pegel={pegel}
          aktiv={hoert}
          onKlick={() => (hoert ? stoppeHoeren() : starteHoeren())}
        />
        <p className="statuszeile" aria-live="polite">
          {statusText}
          {jarvis.fortschritt && (
            <span className="statuszeile__detail">
              {jarvis.fortschritt.task}: {jarvis.fortschritt.done}
              {jarvis.fortschritt.total ? ` von ${jarvis.fortschritt.total}` : ''}
              {jarvis.fortschritt.note ? ` — ${jarvis.fortschritt.note}` : ''}
            </span>
          )}
          {!jarvis.fortschritt && jarvis.statusDetail && (
            <span className="statuszeile__detail">{jarvis.statusDetail}</span>
          )}
        </p>
      </div>

      <div className="verlauf" ref={verlaufRef}>
        {jarvis.beitraege.length === 0 && (
          <div className="leer">
            <p style={{ marginTop: 0 }}>
              {verfuegbar
                ? 'Leertaste halten und sprechen — oder unten tippen.'
                : 'Unten tippen. Spracheingabe ist auf diesem System nicht verfügbar.'}
            </p>
            <p className="eyebrow" style={{ marginTop: '1.5rem' }}>Zum Beispiel</p>
            <p className="leise" style={{ fontSize: '0.9rem' }}>
              „Such mir 15 Bauunternehmen in Hamburg für unsere Baustellenbewachung.“
              <br />
              „Zeig mir alle fertigen Entwürfe.“
              <br />
              „Was steht heute noch an?“
            </p>
          </div>
        )}

        {jarvis.beitraege.map((b) =>
          b.art === 'werkzeug' ? (
            <div key={b.id} className={`werkzeugspur${b.erfolgreich === false ? ' werkzeugspur--fehler' : ''}`}>
              <span className="werkzeugspur__punkt" />
              <span>{b.text}</span>
            </div>
          ) : b.art === 'hinweis' ? (
            <p key={b.id} className="hinweis">
              {b.text}
            </p>
          ) : (
            <div key={b.id} className={`beitrag beitrag--${b.art}`}>
              <p className="beitrag__wer">{b.art === 'benutzer' ? 'Sie' : (b.agent ?? 'JARVIS')}</p>
              <p className="beitrag__text">{b.text}</p>
            </div>
          ),
        )}

        {zwischentext && (
          <div className="beitrag beitrag--benutzer">
            <p className="beitrag__wer">Höre zu …</p>
            <p className="beitrag__text leise">{zwischentext}</p>
          </div>
        )}
      </div>

      {sprachfehler && <p className="hinweis hinweis--warn">{sprachfehler}</p>}

      <div className="eingabe">
        <textarea
          ref={feldRef}
          className="eingabe__feld"
          rows={1}
          placeholder="Anweisung eingeben …"
          value={entwurf}
          onChange={(e) => {
            setEntwurf(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              absenden();
            }
          }}
          aria-label="Anweisung an JARVIS"
        />
        {jarvis.beschaeftigt ? (
          <button type="button" className="knopf" onClick={jarvis.abbrechen}>
            Abbrechen
          </button>
        ) : (
          <button type="button" className="knopf knopf--stark" onClick={absenden} disabled={!entwurf.trim()}>
            Senden
          </button>
        )}
      </div>
    </div>
  );
}
