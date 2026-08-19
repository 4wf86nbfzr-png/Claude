import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Empfindlichkeit } from '@jarvis/core/schnips';
import { aufEreignis } from './bridge.js';
import { starteGespraech, type Gespraech, type GespraechsZustand } from './gespraech.js';
import { starteSchnipser, type Schnipser } from './schnipser.js';
import { setStimme } from './voice.js';
import { useJarvis } from './store.js';

/**
 * Zuhören ist Sache der ganzen Anwendung, nicht einer Ansicht.
 *
 * Anfangs hing das am Konsolen-Fenster. Das war falsch: wer die
 * Versandzentrale offen hatte oder das Fenster weggeklickt hatte, wurde nicht
 * mehr gehört — obwohl JARVIS lief. Ein Assistent, der nur in einer von sieben
 * Ansichten reagiert, ist keiner.
 *
 * Deshalb sitzt der Zustand hier, oberhalb aller Ansichten. Die Konsole zeigt
 * ihn nur noch an und bedient ihn.
 */

export interface SchnipsEinstellungen {
  an: boolean;
  empfindlichkeit: Empfindlichkeit;
  doppelschnipsen: boolean;
}

interface GespraechsKontext {
  zustand: GespraechsZustand;
  pegel: number;
  zwischentext: string;
  fehler: string | null;
  /** Hinweis des Kerns, falls die Erkennung nicht einsatzbereit ist. */
  sttHinweis: string | null;
  einstellungen: SchnipsEinstellungen;
  aendern(patch: Partial<SchnipsEinstellungen>): void;
  starten(): void;
  beenden(): void;
}

const Kontext = createContext<GespraechsKontext | null>(null);

const GESPEICHERT = 'jarvis.schnipsen';
const STANDARD: SchnipsEinstellungen = { an: false, empfindlichkeit: 'normal', doppelschnipsen: false };

/**
 * Empfindlichkeit und Doppelschnipsen bleiben gespeichert, das Anschalten
 * bewusst **nicht**: ein Mikrofon, das beim Programmstart von allein aufgeht,
 * ist keine Einstellung, die man aus der letzten Sitzung erben sollte.
 */
function ladeEinstellungen(): SchnipsEinstellungen {
  try {
    const roh = localStorage.getItem(GESPEICHERT);
    if (roh) return { ...STANDARD, ...(JSON.parse(roh) as Partial<SchnipsEinstellungen>), an: false };
  } catch {
    /* dann eben Standardwerte */
  }
  return STANDARD;
}

export function GespraechProvider({ children }: { children: ReactNode }): JSX.Element {
  const jarvis = useJarvis();
  const [einstellungen, setEinstellungen] = useState<SchnipsEinstellungen>(ladeEinstellungen);
  const [zustand, setZustand] = useState<GespraechsZustand>('schlafend');
  const [pegel, setPegel] = useState(0);
  const [zwischentext, setZwischentext] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [sttHinweis, setSttHinweis] = useState<string | null>(null);

  const schnipserRef = useRef<Schnipser | null>(null);
  const gespraechRef = useRef<Gespraech | null>(null);
  const erkennungRef = useRef<'lokal' | 'browser'>('lokal');

  const beenden = useCallback(() => {
    gespraechRef.current?.beenden();
    gespraechRef.current = null;
    setZustand('schlafend');
    setZwischentext('');
  }, []);

  const starten = useCallback(() => {
    if (gespraechRef.current) return; // läuft schon
    setFehler(null);
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
        setZustand(z);
        if (z === 'schlafend') {
          gespraechRef.current = null;
          setZwischentext('');
        }
      },
      onGesagt: (wer, text) => jarvis.anhaengenVonAussen(wer, text),
      onZwischentext: setZwischentext,
      onFehler: (meldung, endgueltig) => {
        setFehler(meldung);
        // Geht die Erkennung grundsätzlich nicht, hat ein weiteres Schnipsen
        // keinen Sinn. Also Mikrofon zu -- Einschalten wird wieder eine
        // bewusste Entscheidung.
        if (endgueltig) setEinstellungen((alt) => ({ ...alt, an: false }));
      },
    });
  }, [jarvis]);

  // Die Auslöser liegen in Refs, nicht in den Abhängigkeiten des Effekts:
  // sonst schlösse und öffnete jede Zustandsänderung des Kerns das Mikrofon.
  const startenRef = useRef(starten);
  startenRef.current = starten;
  const umschaltenRef = useRef<() => void>(() => {});
  umschaltenRef.current = () => (gespraechRef.current ? beenden() : starten());

  // --- Schnipser --------------------------------------------------------
  useEffect(() => {
    let abgebrochen = false;

    if (!einstellungen.an) {
      schnipserRef.current?.stoppen();
      schnipserRef.current = null;
      setPegel(0);
      return;
    }

    void starteSchnipser({
      empfindlichkeit: einstellungen.empfindlichkeit,
      doppelschnipsen: einstellungen.doppelschnipsen,
      onSchnips: () => umschaltenRef.current(),
      onPegel: setPegel,
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

  // --- Was der Kern über Sprache sagt ------------------------------------
  useEffect(() => {
    let abgebrochen = false;
    void jarvis.senden({ kind: 'voice.status' }).then((r) => {
      if (abgebrochen || !r.ok) return;
      const stt = (r.data as { stt: { provider: string; bereit: boolean; hinweis: string | null } }).stt;
      erkennungRef.current = stt.provider === 'browser' ? 'browser' : 'lokal';
      setSttHinweis(stt.bereit ? null : stt.hinweis);
    });
    void jarvis.senden({ kind: 'settings.all' }).then((r) => {
      if (abgebrochen || !r.ok) return;
      const werte = r.data as Record<string, unknown>;
      const name = werte['voice.tts.stimme'];
      const rohLage = werte['voice.tts.lage'];
      const lage =
        rohLage === 'weiblich' || rohLage === 'egal' || rohLage === 'maennlich' ? rohLage : 'maennlich';
      setStimme(typeof name === 'string' && name ? name : null, lage);
    });
    return () => {
      abgebrochen = true;
    };
    // Absichtlich nur einmal: beides ändert sich nicht im laufenden Betrieb.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Ruf aus der Menüleiste oder per Tastenkürzel -----------------------
  useEffect(
    () =>
      aufEreignis((ereignis) => {
        if (ereignis.name !== 'wecken') return;
        if (!gespraechRef.current) startenRef.current();
      }),
    [],
  );

  // Beim Verlassen alles abräumen.
  useEffect(
    () => () => {
      gespraechRef.current?.beenden();
      schnipserRef.current?.stoppen();
    },
    [],
  );

  const aendern = useCallback((patch: Partial<SchnipsEinstellungen>) => {
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
  }, []);

  const wert = useMemo<GespraechsKontext>(
    () => ({
      zustand,
      pegel,
      zwischentext,
      fehler,
      sttHinweis,
      einstellungen,
      aendern,
      starten,
      beenden,
    }),
    [zustand, pegel, zwischentext, fehler, sttHinweis, einstellungen, aendern, starten, beenden],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useGespraech(): GespraechsKontext {
  const wert = useContext(Kontext);
  if (!wert) throw new Error('useGespraech muss innerhalb von <GespraechProvider> stehen.');
  return wert;
}
