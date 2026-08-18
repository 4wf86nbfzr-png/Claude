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
import type { Command, CommandResponse, IpcEventEnvelope } from '@jarvis/core/ipc';
import { aufEreignis, befehl, bridgeVerfuegbar } from './bridge.js';
import { schweig, sprich } from './voice.js';

export type Zustand =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'WAITING FOR APPROVAL'
  | 'ERROR';

export interface Beitrag {
  id: string;
  art: 'benutzer' | 'jarvis' | 'werkzeug' | 'hinweis';
  text: string;
  agent?: string;
  erfolgreich?: boolean;
  zeit: string;
}

export interface Freigabe {
  nummer: number;
  id: string;
  art: string;
  titel: string;
  frage: string;
  risiko: string;
  angefragtVon: string;
  angefragtAm: string;
  laeuftAbAm: string | null;
  details: Array<{ label: string; value: string; kind?: 'kurz' | 'long' }>;
}

interface JarvisStore {
  bereit: boolean;
  zustand: Zustand;
  statusDetail: string;
  fortschritt: { task: string; done: number; total: number | null; note?: string } | null;
  beitraege: Beitrag[];
  freigaben: Freigabe[];
  fehler: { message: string; hint?: string } | null;
  beschaeftigt: boolean;
  konversationId: string | null;
  sprachausgabeAn: boolean;
  /** Zählt hoch, wenn sich Daten geändert haben -- Ansichten laden dann neu. */
  aktualisierung: number;

  frage(text: string): Promise<void>;
  abbrechen(): void;
  freigeben(id: string, note?: string): Promise<CommandResponse>;
  ablehnen(id: string, note?: string): Promise<CommandResponse>;
  fehlerSchliessen(): void;
  setSprachausgabe(an: boolean): void;
  setZustand(z: Zustand, detail?: string): void;
  senden(command: Command): Promise<CommandResponse>;
  neuLaden(): void;
}

const Kontext = createContext<JarvisStore | null>(null);

let laufendeNummer = 0;
const neueId = () => `b${(laufendeNummer += 1)}`;

export function JarvisProvider({ children }: { children: ReactNode }): JSX.Element {
  const [bereit] = useState(bridgeVerfuegbar);
  const [zustand, setZustandIntern] = useState<Zustand>('IDLE');
  const [statusDetail, setStatusDetail] = useState('');
  const [fortschritt, setFortschritt] = useState<JarvisStore['fortschritt']>(null);
  const [beitraege, setBeitraege] = useState<Beitrag[]>([]);
  const [freigaben, setFreigaben] = useState<Freigabe[]>([]);
  const [fehler, setFehler] = useState<JarvisStore['fehler']>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [konversationId, setKonversationId] = useState<string | null>(null);
  const [sprachausgabeAn, setSprachausgabe] = useState(true);
  const [aktualisierung, setAktualisierung] = useState(0);

  const sprachausgabeRef = useRef(sprachausgabeAn);
  sprachausgabeRef.current = sprachausgabeAn;

  const anhaengen = useCallback((beitrag: Omit<Beitrag, 'id' | 'zeit'>) => {
    setBeitraege((alt) => [...alt, { ...beitrag, id: neueId(), zeit: new Date().toISOString() }].slice(-200));
  }, []);

  const freigabenLaden = useCallback(async () => {
    const r = await befehl({ kind: 'approvals.pending' });
    if (r.ok) setFreigaben(r.data as Freigabe[]);
  }, []);

  const neuLaden = useCallback(() => setAktualisierung((n) => n + 1), []);

  // --- Ereignisse des Kerns ------------------------------------------------
  useEffect(() => {
    const abmelden = aufEreignis((ereignis: IpcEventEnvelope) => {
      switch (ereignis.name) {
        case 'status': {
          const p = ereignis.payload as { state: Zustand; detail?: string };
          setZustandIntern(p.state);
          setStatusDetail(p.detail ?? '');
          if (p.state === 'IDLE') setFortschritt(null);
          break;
        }
        case 'progress':
          setFortschritt(ereignis.payload as JarvisStore['fortschritt']);
          break;
        case 'tool': {
          const p = ereignis.payload as { name: string; ok: boolean; summary: string; agent: string };
          anhaengen({ art: 'werkzeug', text: p.summary, agent: p.agent, erfolgreich: p.ok });
          break;
        }
        case 'approval':
          void freigabenLaden();
          neuLaden();
          break;
        case 'invalidate':
          neuLaden();
          break;
        case 'speak': {
          const p = ereignis.payload as { text: string; interrupt?: boolean };
          if (sprachausgabeRef.current) sprich(p.text, { unterbrechen: p.interrupt ?? false });
          break;
        }
        case 'error': {
          const p = ereignis.payload as { message: string; hint?: string };
          setFehler(p);
          setZustandIntern('ERROR');
          break;
        }
        default:
          break;
      }
    });
    return abmelden;
  }, [anhaengen, freigabenLaden, neuLaden]);

  useEffect(() => {
    void freigabenLaden();
  }, [freigabenLaden]);

  // --- Aktionen -------------------------------------------------------------
  const frage = useCallback(
    async (text: string) => {
      const sauber = text.trim();
      if (!sauber || beschaeftigt) return;

      anhaengen({ art: 'benutzer', text: sauber });
      setBeschaeftigt(true);
      setFehler(null);
      setZustandIntern('THINKING');

      const r = await befehl({ kind: 'ask', text: sauber, ...(konversationId ? { conversationId: konversationId } : {}) });
      setBeschaeftigt(false);

      if (!r.ok) {
        setFehler({ message: r.error.message, ...(r.error.hint ? { hint: r.error.hint } : {}) });
        setZustandIntern('ERROR');
        anhaengen({ art: 'hinweis', text: `Fehler: ${r.error.message}` });
        return;
      }

      const d = r.data as { antwort: string; agent: string; konversationId: string };
      setKonversationId(d.konversationId);
      anhaengen({ art: 'jarvis', text: d.antwort, agent: d.agent });
      if (sprachausgabeRef.current) sprich(d.antwort);
      void freigabenLaden();
      neuLaden();
    },
    [anhaengen, beschaeftigt, freigabenLaden, konversationId, neuLaden],
  );

  const abbrechen = useCallback(() => {
    schweig();
    void befehl({ kind: 'abort' });
    setBeschaeftigt(false);
    setZustandIntern('IDLE');
  }, []);

  const freigeben = useCallback(
    async (id: string, note?: string) => {
      setBeschaeftigt(true);
      const r = await befehl({ kind: 'approvals.approve', approvalId: id, ...(note ? { note } : {}) });
      setBeschaeftigt(false);
      if (!r.ok) {
        setFehler({ message: r.error.message, ...(r.error.hint ? { hint: r.error.hint } : {}) });
        anhaengen({ art: 'hinweis', text: `Ausführung fehlgeschlagen: ${r.error.message}` });
      } else {
        anhaengen({ art: 'hinweis', text: 'Freigabe erteilt und ausgeführt.' });
      }
      await freigabenLaden();
      neuLaden();
      return r;
    },
    [anhaengen, freigabenLaden, neuLaden],
  );

  const ablehnen = useCallback(
    async (id: string, note?: string) => {
      const r = await befehl({ kind: 'approvals.reject', approvalId: id, ...(note ? { note } : {}) });
      if (r.ok) anhaengen({ art: 'hinweis', text: 'Freigabe abgelehnt. Der Entwurf bleibt gespeichert.' });
      await freigabenLaden();
      neuLaden();
      return r;
    },
    [anhaengen, freigabenLaden, neuLaden],
  );

  const wert = useMemo<JarvisStore>(
    () => ({
      bereit,
      zustand,
      statusDetail,
      fortschritt,
      beitraege,
      freigaben,
      fehler,
      beschaeftigt,
      konversationId,
      sprachausgabeAn,
      aktualisierung,
      frage,
      abbrechen,
      freigeben,
      ablehnen,
      fehlerSchliessen: () => setFehler(null),
      setSprachausgabe: (an: boolean) => {
        setSprachausgabe(an);
        if (!an) schweig();
      },
      setZustand: (z, detail) => {
        setZustandIntern(z);
        setStatusDetail(detail ?? '');
      },
      senden: befehl,
      neuLaden,
    }),
    [
      bereit,
      zustand,
      statusDetail,
      fortschritt,
      beitraege,
      freigaben,
      fehler,
      beschaeftigt,
      konversationId,
      sprachausgabeAn,
      aktualisierung,
      frage,
      abbrechen,
      freigeben,
      ablehnen,
      neuLaden,
    ],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useJarvis(): JarvisStore {
  const wert = useContext(Kontext);
  if (!wert) throw new Error('useJarvis muss innerhalb von <JarvisProvider> stehen.');
  return wert;
}

/** Lädt Daten und lädt sie neu, sobald der Kern eine Änderung meldet. */
export function useDaten<T>(command: Command | null, standard: T): { daten: T; laedt: boolean; neu: () => void } {
  const { aktualisierung } = useJarvis();
  const [daten, setDaten] = useState<T>(standard);
  const [laedt, setLaedt] = useState(false);
  const [eigen, setEigen] = useState(0);
  const schluessel = command ? JSON.stringify(command) : null;

  useEffect(() => {
    if (!schluessel) return;
    let abgebrochen = false;
    setLaedt(true);
    void befehl(JSON.parse(schluessel) as Command).then((r) => {
      if (abgebrochen) return;
      setLaedt(false);
      if (r.ok) setDaten(r.data as T);
    });
    return () => {
      abgebrochen = true;
    };
  }, [schluessel, aktualisierung, eigen]);

  return { daten, laedt, neu: () => setEigen((n) => n + 1) };
}
