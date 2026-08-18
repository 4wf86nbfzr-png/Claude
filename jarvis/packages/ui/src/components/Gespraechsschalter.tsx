import { useCallback, useEffect, useRef, useState } from 'react';
import type { Empfindlichkeit } from '@jarvis/core/schnips';
import { starteSchnipser, type Schnipser } from '../lib/schnipser.js';
import { starteGespraech, type Gespraech, type GespraechsZustand } from '../lib/gespraech.js';
import { useJarvis } from '../lib/store.js';

interface Einstellungen {
  an: boolean;
  empfindlichkeit: Empfindlichkeit;
  doppelschnipsen: boolean;
}

const GESPEICHERT = 'jarvis.schnipsen';

const STANDARD: Einstellungen = { an: false, empfindlichkeit: 'normal', doppelschnipsen: false };

/**
 * Empfindlichkeit und Doppelschnipsen bleiben gespeichert, das Anschalten
 * bewusst **nicht**: ein Mikrofon, das beim Programmstart von allein aufgeht,
 * ist keine Einstellung, die man aus der letzten Sitzung erben sollte.
 */
function ladeEinstellungen(): Einstellungen {
  try {
    const roh = localStorage.getItem(GESPEICHERT);
    if (roh) return { ...STANDARD, ...(JSON.parse(roh) as Partial<Einstellungen>), an: false };
  } catch {
    /* dann eben Standardwerte */
  }
  return STANDARD;
}

/**
 * Schnipsen scharf schalten und das Gespräch führen.
 *
 * Bewusst standardmäßig **aus**: Dauerbetrieb des Mikrofons ist nichts, was
 * man jemandem unterschiebt. Die Zeile darüber sagt in klaren Worten, was
 * dabei passiert und was nicht.
 */
export function Gespraechsschalter({
  onZustand,
  onPegel,
  onGesagt,
  onZwischentext,
}: {
  onZustand: (z: GespraechsZustand) => void;
  onPegel: (p: number) => void;
  onGesagt: (wer: 'benutzer' | 'jarvis', text: string) => void;
  onZwischentext: (text: string) => void;
}): JSX.Element {
  const jarvis = useJarvis();
  const [einstellungen, setEinstellungen] = useState<Einstellungen>(ladeEinstellungen);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zustand, setZustand] = useState<GespraechsZustand>('schlafend');
  const [details, setDetails] = useState(false);

  const schnipserRef = useRef<Schnipser | null>(null);
  const gespraechRef = useRef<Gespraech | null>(null);
  /**
   * Welche Erkennung zuhört, sagt der Kern. In der Desktop-App ist das die
   * lokale — die des Browsers funktioniert dort nicht. Läuft die Oberfläche
   * ausnahmsweise in einem echten Browser, darf sie dessen Erkennung nehmen.
   */
  const erkennungRef = useRef<'lokal' | 'browser'>('lokal');
  const [sttHinweis, setSttHinweis] = useState<string | null>(null);

  const zustandSetzen = useCallback(
    (z: GespraechsZustand) => {
      setZustand(z);
      onZustand(z);
    },
    [onZustand],
  );

  const gespraechBeenden = useCallback(() => {
    gespraechRef.current?.beenden();
    gespraechRef.current = null;
    zustandSetzen('schlafend');
  }, [zustandSetzen]);

  const gespraechStarten = useCallback(() => {
    if (gespraechRef.current) return; // läuft schon
    gespraechRef.current = starteGespraech({
      erkennung: erkennungRef.current,
      frage: async (text) => {
        const r = await jarvis.senden({ kind: 'ask', text, gespraechsmodus: true });
        if (r.ok) {
          jarvis.neuLaden();
          return (r.data as { antwort: string }).antwort;
        }
        return `Das ging nicht: ${r.error.message}`;
      },
      eroeffnung: async () => {
        const r = await jarvis.senden({ kind: 'conversation.greeting' });
        return r.ok ? (r.data as { text: string }).text : 'Ja?';
      },
      onZustand: (z) => {
        zustandSetzen(z);
        if (z === 'schlafend') gespraechRef.current = null;
      },
      onGesagt,
      onZwischentext,
      onFehler: (meldung, endgueltig) => {
        setFehler(meldung);
        // Wenn die Erkennung grundsätzlich nicht geht, hat es keinen Sinn,
        // beim nächsten Schnipsen wieder anzufangen. Also Mikrofon zu -- das
        // Einschalten ist dann wieder eine bewusste Entscheidung.
        if (endgueltig) setEinstellungen((alt) => ({ ...alt, an: false }));
      },
    });
  }, [jarvis, onGesagt, onZwischentext, zustandSetzen]);

  // Der Auslöser liegt in einer Ref, nicht in den Abhängigkeiten des Effekts:
  // sonst würde das Mikrofon bei jeder Zustandsänderung des Kerns geschlossen
  // und neu geöffnet -- mitten im Gespräch, und die Fehlermeldung wäre weg.
  const onPegelRef = useRef(onPegel);
  onPegelRef.current = onPegel;
  const aufSchnipsRef = useRef<() => void>(() => {});
  aufSchnipsRef.current = () => {
    if (gespraechRef.current) gespraechBeenden();
    else gespraechStarten();
  };

  // Schnipser an- und abschalten.
  useEffect(() => {
    let abgebrochen = false;

    if (!einstellungen.an) {
      schnipserRef.current?.stoppen();
      schnipserRef.current = null;
      onPegelRef.current(0);
      return;
    }

    void starteSchnipser({
      empfindlichkeit: einstellungen.empfindlichkeit,
      doppelschnipsen: einstellungen.doppelschnipsen,
      onSchnips: () => aufSchnipsRef.current(),
      onPegel: (p) => onPegelRef.current(p),
      onFehler: (meldung) => {
        setFehler(meldung);
        setEinstellungen((alt) => ({ ...alt, an: false }));
      },
    }).then((s) => {
      if (abgebrochen) {
        s?.stoppen();
        return;
      }
      schnipserRef.current = s;
      if (s) setFehler(null);
    });

    return () => {
      abgebrochen = true;
      schnipserRef.current?.stoppen();
      schnipserRef.current = null;
    };
  }, [einstellungen.an, einstellungen.empfindlichkeit, einstellungen.doppelschnipsen]);

  // Einmal beim Anzeigen fragen, womit erkannt wird.
  useEffect(() => {
    let abgebrochen = false;
    void jarvis.senden({ kind: 'voice.status' }).then((r) => {
      if (abgebrochen || !r.ok) return;
      const stt = (r.data as { stt: { provider: string; bereit: boolean; hinweis: string | null } }).stt;
      erkennungRef.current = stt.provider === 'browser' ? 'browser' : 'lokal';
      setSttHinweis(stt.bereit ? null : stt.hinweis);
    });
    return () => {
      abgebrochen = true;
    };
    // Absichtlich nur beim ersten Mal: die Einstellung ändert sich nicht
    // mitten im Betrieb, und `jarvis` wird bei jeder Änderung neu gebaut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Beim Verlassen alles abräumen.
  useEffect(() => () => {
    gespraechRef.current?.beenden();
    schnipserRef.current?.stoppen();
  }, []);

  const aendern = (patch: Partial<Einstellungen>) => {
    setEinstellungen((alt) => {
      const neu = { ...alt, ...patch };
      try {
        const { an: _an, ...bleibt } = neu;
        localStorage.setItem(GESPEICHERT, JSON.stringify(bleibt));
      } catch {
        /* privater Modus -- dann eben nur für diese Sitzung */
      }
      return neu;
    });
  };

  return (
    <div className="schnips">
      <div className="schnips__reihe">
        <label className="schnips__schalter">
          <input
            type="checkbox"
            checked={einstellungen.an}
            onChange={(e) => aendern({ an: e.target.checked })}
          />
          <span>Auf Schnipsen hören</span>
        </label>

        {einstellungen.an && (
          <span className={`merkmal ${zustand === 'schlafend' ? '' : 'merkmal--ok'}`}>
            {zustand === 'schlafend' ? 'wartet auf Schnipsen' : 'im Gespräch'}
          </span>
        )}

        {zustand !== 'schlafend' && (
          <button type="button" className="knopf knopf--klein" onClick={gespraechBeenden}>
            Gespräch beenden
          </button>
        )}
        {einstellungen.an && zustand === 'schlafend' && (
          <button type="button" className="knopf knopf--klein" onClick={gespraechStarten}>
            Ohne Schnipsen starten
          </button>
        )}

        <button
          type="button"
          className="knopf knopf--klein"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
        >
          {details ? 'Weniger' : 'Einstellungen'}
        </button>
      </div>

      {einstellungen.an && (
        <p className="schnips__hinweis">
          Das Mikrofon ist offen. Der Ton wird nur hier im Fenster ausgewertet — nichts wird
          aufgezeichnet und nichts verschickt, bis Sie nach dem Schnipsen wirklich sprechen.
        </p>
      )}

      {details && (
        <div className="schnips__details">
          <label className="schnips__feld">
            <span className="feld__label">Empfindlichkeit</span>
            <select
              value={einstellungen.empfindlichkeit}
              onChange={(e) => aendern({ empfindlichkeit: e.target.value as Empfindlichkeit })}
            >
              <option value="streng">streng — reagiert nur auf deutliches Schnipsen</option>
              <option value="normal">normal</option>
              <option value="locker">locker — reagiert früher, öfter Fehlalarm</option>
            </select>
          </label>

          <label className="schnips__schalter">
            <input
              type="checkbox"
              checked={einstellungen.doppelschnipsen}
              onChange={(e) => aendern({ doppelschnipsen: e.target.checked })}
            />
            <span>Zweimal schnipsen (deutlich weniger Fehlauslöser)</span>
          </label>

          <p className="schnips__hinweis">
            Eine rein akustische Erkennung ist nicht perfekt: Klatschen, ein zufallender Deckel
            oder ein harter Tastenanschlag können ähnlich klingen. Wenn JARVIS zu oft von selbst
            anspringt, hilft „streng" oder zweimal schnipsen.
          </p>
        </div>
      )}

      {sttHinweis && !fehler && <p className="hinweis hinweis--warn">{sttHinweis}</p>}
      {fehler && <p className="hinweis hinweis--warn">{fehler}</p>}
    </div>
  );
}
