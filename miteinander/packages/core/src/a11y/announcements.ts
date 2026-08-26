import type { EffectivePreferences } from './preferences';

/**
 * Texte fuer Screenreader-Ansagen (Live-Regions) und den integrierten
 * Vorlesemodus. Getrennt vom sichtbaren Text, weil Screenreader Kontext
 * brauchen, den Sehende aus dem Layout ablesen.
 */
export interface Announcement {
  /** Was vorgelesen wird. */
  text: string;
  /** "polite" unterbricht nicht, "assertive" nur bei Fehlern und Sicherheit. */
  politeness: 'polite' | 'assertive';
}

export function polite(text: string): Announcement {
  return { text, politeness: 'polite' };
}

export function assertive(text: string): Announcement {
  return { text, politeness: 'assertive' };
}

export function stepAnnouncement(step: number, total: number, title: string): Announcement {
  return polite(`Schritt ${step} von ${total}. ${title}`);
}

export function errorAnnouncement(fieldLabel: string, problem: string): Announcement {
  return assertive(`Fehler bei ${fieldLabel}. ${problem}`);
}

export function savedDraftAnnouncement(): Announcement {
  return polite('Ihre Eingaben sind als Entwurf gespeichert.');
}

/**
 * Entscheidet, ob der eigene Vorlesemodus sprechen darf. Laeuft VoiceOver oder
 * TalkBack, schweigt die App -- sonst reden zwei Stimmen gleichzeitig.
 */
export function shouldSpeakInApp(prefs: Pick<EffectivePreferences, 'readAloud' | 'suppressInAppReadAloud'>): boolean {
  return prefs.readAloud && !prefs.suppressInAppReadAloud;
}

/** Baut ein Screenreader-Label aus Bestandteilen, ohne leere Fragmente. */
export function composeLabel(...parts: Array<string | undefined | null | false>): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim().replace(/[.:]$/, ''))
    .join('. ')
    .concat('.');
}
