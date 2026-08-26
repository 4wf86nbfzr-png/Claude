import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { shouldSpeakInApp, type EffectivePreferences } from '@miteinander/core';

/**
 * Integrierter Vorlesemodus.
 *
 * Wichtig: Laeuft VoiceOver oder TalkBack, schweigt dieser Vorlesemodus --
 * sonst sprechen zwei Stimmen uebereinander. Stattdessen wird der Text als
 * Ansage an den Screenreader uebergeben.
 */
export function useReadAloud(prefs: EffectivePreferences) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      void Speech.stop();
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!shouldSpeakInApp(prefs)) {
        // Der Screenreader liest ohnehin -- wir stossen nur eine Ansage an.
        AccessibilityInfo.announceForAccessibility(text);
        return;
      }
      void Speech.stop();
      setSpeaking(true);
      Speech.speak(text, {
        language: 'de-DE',
        rate: prefs.readAloudRate,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    [prefs],
  );

  const stop = useCallback(() => {
    void Speech.stop();
    setSpeaking(false);
  }, []);

  return { speak, stop, speaking, available: Platform.OS !== 'web' || true };
}

/** Ansage fuer Screenreader, z. B. nach dem Speichern eines Entwurfs. */
export function announce(text: string) {
  AccessibilityInfo.announceForAccessibility(text);
}
