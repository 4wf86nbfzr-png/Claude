import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FreigabeAnsicht } from '@shared/ipc';
import type { AgentEvent, ChatMessage, SystemStatus } from '@shared/types';
import { VoiceState } from '@shared/status';
import { Sprachsteuerung, type SttModus } from '../lib/voice';

export interface JarvisZustand {
  nachrichten: ChatMessage[];
  zustand: VoiceState;
  fortschritt: string | null;
  freigaben: FreigabeAnsicht[];
  status: SystemStatus | null;
  beschaeftigt: boolean;
  fehler: string | null;
  hoert: boolean;
  pegel: number;
  autoVorlesen: boolean;
}

/**
 * Bindeglied zwischen Oberfläche und Kern.
 *
 * Hält den Gesprächsverlauf, hört auf die Ereignisse des Kerns und steuert
 * Mikrofon und Sprachausgabe.
 */
export function useJarvis() {
  const [nachrichten, setNachrichten] = useState<ChatMessage[]>([]);
  const [zustand, setZustand] = useState<VoiceState>(VoiceState.IDLE);
  const [fortschritt, setFortschritt] = useState<string | null>(null);
  const [freigaben, setFreigaben] = useState<FreigabeAnsicht[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hoert, setHoert] = useState(false);
  const [pegel, setPegel] = useState(0);
  const [autoVorlesen, setAutoVorlesen] = useState(true);

  const sprache = useMemo(() => new Sprachsteuerung(), []);
  const autoRef = useRef(autoVorlesen);
  autoRef.current = autoVorlesen;

  const ladeFreigaben = useCallback(async () => {
    setFreigaben(await window.jarvis.offeneFreigaben());
  }, []);

  const ladeStatus = useCallback(async () => {
    setStatus(await window.jarvis.status());
  }, []);

  useEffect(() => {
    void (async () => {
      setNachrichten(await window.jarvis.verlauf());
      await ladeFreigaben();
      await ladeStatus();
    })();

    const abmelden = window.jarvis.aufEreignis((event: AgentEvent) => {
      if (event.kind === 'state' && event.state) setZustand(event.state);
      if (event.kind === 'progress' && event.text) setFortschritt(event.text);
      if (event.kind === 'tool' && event.toolName) {
        setFortschritt(
          event.toolStatus === 'start' ? `${event.toolName} …` : `${event.toolName}: ${event.text ?? 'fertig'}`
        );
      }
      if (event.kind === 'approval') void ladeFreigaben();
      if (event.kind === 'speak' && event.text && autoRef.current) {
        void sprache.sprich(event.text).catch((error: Error) => setFehler(error.message));
      }
    });
    return abmelden;
  }, [ladeFreigaben, ladeStatus, sprache]);

  const senden = useCallback(
    async (text: string) => {
      const wert = text.trim();
      if (!wert || beschaeftigt) return;
      setFehler(null);
      setBeschaeftigt(true);
      setNachrichten((bisher) => [
        ...bisher,
        { id: `lokal-${Date.now()}`, role: 'user', content: wert, createdAt: new Date().toISOString() }
      ]);
      try {
        const antwort = await window.jarvis.senden(wert);
        setNachrichten((bisher) => [...bisher, antwort.nachricht]);
      } catch (error) {
        setFehler((error as Error).message);
        setZustand(VoiceState.ERROR);
      } finally {
        setBeschaeftigt(false);
        setFortschritt(null);
        await ladeFreigaben();
        await ladeStatus();
      }
    },
    [beschaeftigt, ladeFreigaben, ladeStatus]
  );

  const entscheiden = useCallback(
    async (approvalId: number, freigegeben: boolean) => {
      setBeschaeftigt(true);
      try {
        const ergebnis = await window.jarvis.entscheiden(approvalId, freigegeben);
        setNachrichten((bisher) => [
          ...bisher,
          {
            id: `freigabe-${approvalId}-${Date.now()}`,
            role: 'assistant',
            agent: 'ApprovalService',
            content: ergebnis.meldung,
            createdAt: new Date().toISOString()
          }
        ]);
        if (!ergebnis.ok) setFehler(ergebnis.meldung);
        if (autoRef.current) void sprache.sprich(ergebnis.meldung).catch(() => undefined);
      } finally {
        setBeschaeftigt(false);
        await ladeFreigaben();
        await ladeStatus();
      }
    },
    [ladeFreigaben, ladeStatus, sprache]
  );

  const mikrofonUmschalten = useCallback(async () => {
    setFehler(null);
    if (hoert) {
      setHoert(false);
      setZustand(VoiceState.THINKING);
      try {
        const text = await sprache.beendeAufnahme();
        setPegel(0);
        if (text) await senden(text);
        else {
          setZustand(VoiceState.IDLE);
          setFehler('Es wurde nichts erkannt.');
        }
      } catch (error) {
        setPegel(0);
        setZustand(VoiceState.ERROR);
        setFehler((error as Error).message);
      }
      return;
    }
    const modus: SttModus = status?.stt[0]?.id === 'browser' ? 'fenster' : 'kern';
    try {
      await sprache.starteAufnahme(modus, setPegel);
      setHoert(true);
      setZustand(VoiceState.LISTENING);
    } catch (error) {
      setFehler((error as Error).message);
      setZustand(VoiceState.ERROR);
    }
  }, [hoert, senden, sprache, status]);

  const vorlesen = useCallback(
    async (text: string) => {
      try {
        await sprache.sprich(text);
      } catch (error) {
        setFehler((error as Error).message);
      }
    },
    [sprache]
  );

  const vorlesenBeenden = useCallback(() => sprache.stoppSprechen(), [sprache]);

  const verlaufLoeschen = useCallback(async () => {
    await window.jarvis.verlaufLoeschen();
    setNachrichten([]);
  }, []);

  return {
    nachrichten,
    zustand,
    fortschritt,
    freigaben,
    status,
    beschaeftigt,
    fehler,
    hoert,
    pegel,
    autoVorlesen,
    setAutoVorlesen,
    senden,
    entscheiden,
    mikrofonUmschalten,
    vorlesen,
    vorlesenBeenden,
    verlaufLoeschen,
    ladeStatus,
    ladeFreigaben,
    setFehler
  };
}
