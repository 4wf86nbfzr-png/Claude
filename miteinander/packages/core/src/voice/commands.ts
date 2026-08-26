/**
 * Sprachsteuerung.
 *
 * Zentrale Regel: Geld, Buchungen, Datenfreigaben, Loeschungen und
 * Kontaktfreigaben werden NIE allein aufgrund eines erkannten Sprachbefehls
 * ausgefuehrt. Solche Befehle fuehren immer zu einer Rueckfrage, die auch
 * ohne Stimme beantwortet werden kann.
 */

export type VoiceIntent =
  | 'read_aloud'
  | 'back'
  | 'repeat'
  | 'search_help'
  | 'next_suggestion'
  | 'open_profile'
  | 'confirm_booking'
  | 'cancel'
  | 'help'
  | 'stop_listening'
  | 'accessibility_center';

export interface CommandDefinition {
  intent: VoiceIntent;
  /** Beispielbefehle, die auch im Hilfetext stehen. */
  phrases: string[];
  /** Folgenreiche Handlung: braucht zusaetzliche ausdrueckliche Bestaetigung. */
  requiresConfirmation: boolean;
  /** Was die App zurueckspricht, bevor etwas passiert. */
  confirmationPrompt?: string;
}

export const VOICE_COMMANDS: CommandDefinition[] = [
  { intent: 'read_aloud', phrases: ['vorlesen', 'lies vor', 'vorlesen bitte'], requiresConfirmation: false },
  { intent: 'back', phrases: ['zurück', 'zurueck', 'einen schritt zurück'], requiresConfirmation: false },
  { intent: 'repeat', phrases: ['wiederholen', 'noch einmal', 'nochmal'], requiresConfirmation: false },
  { intent: 'search_help', phrases: ['hilfe suchen', 'ich brauche hilfe', 'unterstützung suchen'], requiresConfirmation: false },
  { intent: 'next_suggestion', phrases: ['nächster vorschlag', 'naechster vorschlag', 'weiter'], requiresConfirmation: false },
  { intent: 'open_profile', phrases: ['profil öffnen', 'profil oeffnen', 'profil anzeigen'], requiresConfirmation: false },
  {
    intent: 'confirm_booking',
    phrases: ['termin bestätigen', 'termin bestaetigen', 'buchung bestätigen'],
    requiresConfirmation: true,
    confirmationPrompt:
      'Sie möchten den Termin verbindlich buchen. Ich lese Ihnen die Buchung noch einmal vor. Danach bestätigen Sie bitte auf dem Bildschirm.',
  },
  { intent: 'cancel', phrases: ['abbrechen', 'stopp', 'halt'], requiresConfirmation: false },
  { intent: 'help', phrases: ['hilfe', 'was kann ich sagen'], requiresConfirmation: false },
  { intent: 'stop_listening', phrases: ['nicht mehr zuhören', 'mikrofon aus'], requiresConfirmation: false },
  {
    intent: 'accessibility_center',
    phrases: ['bedienhilfen', 'barrierefreiheit', 'einstellungen für bedienung'],
    requiresConfirmation: false,
  },
];

/**
 * Handlungen, die nie per Stimme allein ausgeloest werden duerfen -- unabhaengig
 * davon, welcher Befehl erkannt wurde.
 */
export const IRREVERSIBLE_ACTIONS = [
  'booking.confirm',
  'payment.authorize',
  'payment.capture',
  'consent.grant',
  'consent.revoke',
  'contact.release',
  'account.delete',
  'profile.share_sensitive',
] as const;
export type IrreversibleAction = (typeof IRREVERSIBLE_ACTIONS)[number];

export function requiresVisualConfirmation(action: string): boolean {
  return (IRREVERSIBLE_ACTIONS as readonly string[]).includes(action);
}

export interface RecognitionResult {
  transcript: string;
  /** Erkennungsguete zwischen 0 und 1. */
  confidence: number;
}

export type CommandOutcome =
  | { kind: 'execute'; intent: VoiceIntent; transcript: string }
  | { kind: 'confirm'; intent: VoiceIntent; transcript: string; prompt: string }
  | { kind: 'clarify'; transcript: string; message: string; suggestions: string[] }
  | { kind: 'fallback'; message: string; suggestions: string[] };

export const MIN_CONFIDENCE = 0.6;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED = VOICE_COMMANDS.map((c) => ({
  definition: c,
  phrases: c.phrases.map(normalize),
}));

/**
 * Wertet ein Erkennungsergebnis aus.
 *
 * Bei niedriger Erkennungsguete wird nachgefragt statt geraten -- und es gibt
 * immer einen Weg ohne Stimme.
 */
export function interpret(result: RecognitionResult): CommandOutcome {
  const transcript = result.transcript.trim();
  const normalized = normalize(transcript);

  if (normalized.length === 0) {
    return {
      kind: 'fallback',
      message: 'Ich habe nichts verstanden. Sie können auch tippen.',
      suggestions: exampleCommands(),
    };
  }

  const hit = NORMALIZED.find((c) => c.phrases.some((p) => normalized === p || normalized.includes(p)));

  if (!hit) {
    return {
      kind: 'clarify',
      transcript,
      message: `Ich habe „${transcript}“ verstanden. Das kenne ich noch nicht.`,
      suggestions: exampleCommands(),
    };
  }

  if (result.confidence < MIN_CONFIDENCE) {
    return {
      kind: 'clarify',
      transcript,
      message: `Ich habe Sie nicht sicher verstanden. Meinten Sie „${hit.definition.phrases[0]}“?`,
      suggestions: [hit.definition.phrases[0] ?? '', 'Nein, etwas anderes'].filter(Boolean),
    };
  }

  if (hit.definition.requiresConfirmation) {
    return {
      kind: 'confirm',
      intent: hit.definition.intent,
      transcript,
      prompt: hit.definition.confirmationPrompt ?? 'Bitte bestätigen Sie auf dem Bildschirm.',
    };
  }

  return { kind: 'execute', intent: hit.definition.intent, transcript };
}

export function exampleCommands(): string[] {
  return ['Vorlesen', 'Zurück', 'Wiederholen', 'Hilfe suchen', 'Nächster Vorschlag', 'Abbrechen'];
}

/** Gruende, warum die Spracheingabe gerade nicht geht -- mit echter Alternative. */
export type VoiceUnavailableReason = 'no_permission' | 'noise' | 'offline' | 'unsupported';

export function voiceFallback(reason: VoiceUnavailableReason): { message: string; action: string } {
  switch (reason) {
    case 'no_permission':
      return {
        message: 'Die App darf das Mikrofon nicht benutzen.',
        action: 'Sie können alles auch tippen oder antippen. Das Mikrofon können Sie später erlauben.',
      };
    case 'noise':
      return {
        message: 'Es ist gerade zu laut. Ich verstehe Sie schlecht.',
        action: 'Sie können Ihre Eingabe auch tippen. Oder es an einem ruhigeren Ort noch einmal versuchen.',
      };
    case 'offline':
      return {
        message: 'Die Spracherkennung braucht Internet. Gerade ist keine Verbindung da.',
        action: 'Sie können weiter tippen. Ihre Eingaben werden gespeichert.',
      };
    case 'unsupported':
    default:
      return {
        message: 'Ihr Gerät unterstützt die Spracheingabe hier nicht.',
        action: 'Alle Funktionen gehen auch ohne Sprache.',
      };
  }
}

/**
 * Aufnahmezustand. Es gibt keine dauerhafte Aufnahme -- das Mikrofon laeuft nur
 * nach bewusster Aktivierung und sichtbar.
 */
export interface MicrophoneState {
  active: boolean;
  activatedAt?: string;
  /** Automatische Abschaltung nach dieser Zeit ohne Eingabe. */
  autoStopSeconds: number;
  visibleIndicator: true;
}

export function startListening(now: string): MicrophoneState {
  return { active: true, activatedAt: now, autoStopSeconds: 15, visibleIndicator: true };
}

export function stopListening(): MicrophoneState {
  return { active: false, autoStopSeconds: 15, visibleIndicator: true };
}
