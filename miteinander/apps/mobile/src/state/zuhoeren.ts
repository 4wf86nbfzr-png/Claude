import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Zuhoeren.
 *
 * Die Sprachfuehrung braucht zwei Haelften: sprechen (expo-speech) und
 * hoeren. Diese Datei ist die zweite Haelfte.
 *
 * Stand der Dinge, offen benannt:
 *  - Im Browser gibt es die Web Speech API. Sie laeuft hier und erkennt
 *    deutsche Saetze brauchbar. In Chrome geht die Aufnahme dafuer an einen
 *    Server von Google -- deshalb steht das im Bildschirm und in
 *    PRIVACY.md, und deshalb faengt nichts von allein an zu hoeren.
 *  - In der nativen App gibt es keine Erkennung ohne zusaetzliches Modul
 *    (expo-speech spricht nur). Dort bleibt der Knopf sichtbar, sagt aber
 *    ehrlich, dass Tippen der Weg ist.
 *
 * In beiden Faellen fuehrt derselbe Weg zum Ziel: Der erkannte oder
 * getippte Satz geht durch dieselbe Auswertung (ersteWunsch). Wer nicht
 * sprechen kann oder will, verliert keine Funktion.
 */

export type ZuhoerStand = 'aus' | 'laeuft' | 'nicht_moeglich' | 'verweigert' | 'fehler';

interface ErkennungEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  resultIndex: number;
}

interface Erkennung {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: ErkennungEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type ErkennungKlasse = new () => Erkennung;

function erkennungsKlasse(): ErkennungKlasse | null {
  // Kein DOM in den Typen dieses Projekts -- deshalb ueber globalThis.
  if (Platform.OS !== 'web') return null;
  const w = globalThis as unknown as {
    SpeechRecognition?: ErkennungKlasse;
    webkitSpeechRecognition?: ErkennungKlasse;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Ob dieses Geraet ueberhaupt zuhoeren kann -- fuer den Text auf dem Knopf. */
export function zuhoerenMoeglich(): boolean {
  return erkennungsKlasse() !== null;
}

export const ZUHOEREN_HINWEIS_WEB =
  'Beim Zuhören wird Ihre Stimme vom Browser ausgewertet. In manchen Browsern geschieht das auf einem Server des Browser-Herstellers. Die App speichert nichts davon. Sie können stattdessen jederzeit tippen.';

export const ZUHOEREN_HINWEIS_APP =
  'Auf diesem Gerät kann die App noch nicht zuhören. Tippen Sie Ihren Satz – die Führung läuft danach genauso weiter. Vorlesen funktioniert.';

export function useZuhoeren(beiSatz: (text: string) => void) {
  const [stand, setStand] = useState<ZuhoerStand>(() =>
    erkennungsKlasse() ? 'aus' : 'nicht_moeglich',
  );
  const [zwischenstand, setZwischenstand] = useState('');
  const laufend = useRef<Erkennung | null>(null);
  // Der Rueckruf darf sich aendern, ohne die Erkennung neu zu starten.
  const rueckruf = useRef(beiSatz);
  rueckruf.current = beiSatz;

  const stoppen = useCallback(() => {
    laufend.current?.abort();
    laufend.current = null;
    setZwischenstand('');
    setStand((s) => (s === 'laeuft' ? 'aus' : s));
  }, []);

  useEffect(() => stoppen, [stoppen]);

  const starten = useCallback(() => {
    const Klasse = erkennungsKlasse();
    if (!Klasse) {
      setStand('nicht_moeglich');
      return;
    }
    stoppen();
    const erkennung = new Klasse();
    erkennung.lang = 'de-DE';
    // Ein Satz genuegt. Dauerlauschen waere ein offenes Mikrofon.
    erkennung.continuous = false;
    erkennung.interimResults = true;
    erkennung.maxAlternatives = 1;

    erkennung.onresult = (e) => {
      let fertig = '';
      let vorlaeufig = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const treffer = e.results[i];
        const text = treffer?.[0]?.transcript ?? '';
        if (treffer?.isFinal) fertig += text;
        else vorlaeufig += text;
      }
      setZwischenstand(vorlaeufig);
      if (fertig.trim()) {
        setZwischenstand('');
        setStand('aus');
        laufend.current = null;
        erkennung.stop();
        rueckruf.current(fertig.trim());
      }
    };

    erkennung.onerror = (e) => {
      laufend.current = null;
      setZwischenstand('');
      setStand(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'verweigert' : 'fehler');
    };

    erkennung.onend = () => {
      if (laufend.current === erkennung) {
        laufend.current = null;
        setStand((s) => (s === 'laeuft' ? 'aus' : s));
      }
    };

    try {
      erkennung.start();
      laufend.current = erkennung;
      setStand('laeuft');
    } catch {
      setStand('fehler');
    }
  }, [stoppen]);

  return { stand, zwischenstand, starten, stoppen };
}

/** Was auf dem Bildschirm steht, wenn das Zuhören nicht klappt. */
export function zuhoerMeldung(stand: ZuhoerStand): string | null {
  switch (stand) {
    case 'verweigert':
      return 'Das Mikrofon ist nicht freigegeben. Sie können den Satz tippen – es geht genauso weiter.';
    case 'fehler':
      return 'Ich konnte nicht zuhören. Versuchen Sie es noch einmal, oder tippen Sie Ihren Satz.';
    case 'nicht_moeglich':
      return ZUHOEREN_HINWEIS_APP;
    default:
      return null;
  }
}
