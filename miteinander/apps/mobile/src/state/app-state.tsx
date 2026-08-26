import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, AccessibilityInfo } from 'react-native';
import { ladeEinstellungen, speichereEinstellungen } from './speicher';
import {
  SupportService,
  createCounterIds,
  createDefaultPreferences,
  createMemoryContext,
  demoSeed,
  resolvePreferences,
  switchMode,
  systemClock,
  clampPreferences,
  DgsRegistry,
  EasyLanguageRegistry,
  type AccessibilityPreferences,
  type DataContext,
  type EffectivePreferences,
  type UiMode,
  type Id,
} from '@miteinander/core';

/**
 * Anwendungszustand der App.
 *
 * Im Demo-Modus laeuft alles gegen die In-Memory-Datenschicht mit den
 * fiktiven Seed-Daten -- die App ist damit ohne Backend vollstaendig
 * bedienbar. Fuer den Betrieb wird `createMemoryContext` gegen den
 * Supabase-Adapter getauscht; die Oberflaeche bleibt unveraendert.
 */

export type Mode = 'seek' | 'offer' | 'assisted' | null;

interface AppStateValue {
  service: SupportService;
  data: DataContext;
  prefs: EffectivePreferences;
  rawPrefs: AccessibilityPreferences;
  setUiMode: (mode: UiMode) => void;
  updatePrefs: (patch: Partial<AccessibilityPreferences>) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  currentUserId: Id;
  setCurrentUserId: (id: Id) => void;
  dgs: DgsRegistry;
  easy: EasyLanguageRegistry;
  /** Merkt sich den Entwurf der laufenden Anfrage. */
  activeRequestId: Id | null;
  setActiveRequestId: (id: Id | null) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const DEMO_USER = 'u_seeker_1';

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  const [data] = useState<DataContext>(() => createMemoryContext(demoSeed));
  const [service] = useState(() => new SupportService(data, systemClock, createCounterIds(1000)));
  const [dgs] = useState(() => new DgsRegistry());
  const [easy] = useState(() => new EasyLanguageRegistry());

  const [currentUserId, setCurrentUserId] = useState<Id>(DEMO_USER);
  const [mode, setMode] = useState<Mode>(null);
  const [activeRequestId, setActiveRequestId] = useState<Id | null>(null);
  const [rawPrefs, setRawPrefs] = useState<AccessibilityPreferences>(() =>
    createDefaultPreferences(DEMO_USER, 'standard', new Date().toISOString()),
  );
  // Solange die gespeicherten Einstellungen noch nicht gelesen sind, wird
  // nichts zurueckgeschrieben -- sonst ueberschreibt der Startwert sie.
  const [gelesen, setGelesen] = useState(false);

  // Einmal beim Start aus dem Speicher holen.
  useEffect(() => {
    let aktiv = true;
    void ladeEinstellungen<AccessibilityPreferences>().then((gespeichert) => {
      if (!aktiv) return;
      if (gespeichert) {
        setRawPrefs((aktuell) =>
          clampPreferences({ ...aktuell, ...gespeichert, userId: aktuell.userId }),
        );
      }
      setGelesen(true);
    });
    return () => {
      aktiv = false;
    };
  }, []);

  // Jede Aenderung sofort sichern. Wer die App schliesst, findet seine
  // Bedienung beim naechsten Start unveraendert vor.
  useEffect(() => {
    if (!gelesen) return;
    void speichereEinstellungen(rawPrefs);
  }, [rawPrefs, gelesen]);

  // Systemzustaende abfragen und auf Aenderungen hoeren.
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => mounted && setScreenReaderEnabled(v));
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setSystemReduceMotion(v));
    const sr = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderEnabled);
    const rm = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    return () => {
      mounted = false;
      sr.remove();
      rm.remove();
    };
  }, []);

  const prefs = useMemo(
    () =>
      resolvePreferences(rawPrefs, {
        screenReaderEnabled,
        prefersReducedMotion: systemReduceMotion,
        colorScheme: systemScheme === 'dark' ? 'dark' : 'light',
      }),
    [rawPrefs, screenReaderEnabled, systemReduceMotion, systemScheme],
  );

  const setUiMode = useCallback((next: UiMode) => {
    setRawPrefs((current) => switchMode(current, next, new Date().toISOString()));
  }, []);

  const updatePrefs = useCallback((patch: Partial<AccessibilityPreferences>) => {
    setRawPrefs((current) =>
      clampPreferences({ ...current, ...patch, updatedAt: new Date().toISOString() }),
    );
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      service,
      data,
      prefs,
      rawPrefs,
      setUiMode,
      updatePrefs,
      mode,
      setMode,
      currentUserId,
      setCurrentUserId,
      dgs,
      easy,
      activeRequestId,
      setActiveRequestId,
    }),
    [service, data, prefs, rawPrefs, setUiMode, updatePrefs, mode, currentUserId, dgs, easy, activeRequestId],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState muss innerhalb von AppStateProvider stehen.');
  return ctx;
}
