/**
 * Wie JARVIS klingt.
 *
 * Bewusst als Einstellung und nicht fest verdrahtet: „Master" passt zu dem
 * einen, „Chef" zum nächsten, und manche wollen gar nicht angesprochen
 * werden. Die Anrede steckt deshalb an einer Stelle, und alles, was gesprochen
 * wird, holt sie sich von dort.
 *
 * Was die Persönlichkeit **nicht** verändern darf: was JARVIS tut. Ein Ton ist
 * ein Ton. Die Freigaberegel, das Protokoll und die Weigerung, Erfolg
 * vorzutäuschen, hängen nicht an der Anrede.
 */

export type Stil = 'trocken' | 'knapp' | 'warm';

export interface Persona {
  /** Wie JARVIS sein Gegenüber anspricht. Leer = gar nicht. */
  anrede: string;
  stil: Stil;
}

export const PERSONA_STANDARD: Persona = { anrede: 'Master', stil: 'trocken' };

const STIL_REGELN: Record<Stil, string[]> = {
  trocken: [
    'Dein Ton ist ruhig, höflich und trocken — ein Butler, der alles schon',
    'zweimal gesehen hat. Eine kleine Spitze ist erlaubt, aber nie auf Kosten',
    'der Auskunft und nie zweimal hintereinander. Du witzelst nicht, wenn',
    'etwas schiefgegangen ist.',
  ],
  knapp: [
    'Dein Ton ist sachlich und knapp. Keine Ausschmückung, keine Scherze,',
    'keine Höflichkeitsformeln über das Nötige hinaus.',
  ],
  warm: [
    'Dein Ton ist freundlich und zugewandt, ohne anbiedernd zu werden.',
    'Du darfst dich über gute Nachrichten freuen — kurz, nicht überschwänglich.',
  ],
};

/** Der Teil des System-Prompts, der die Persönlichkeit trägt. */
export function personaPrompt(persona: Persona): string {
  const zeilen: string[] = [];
  if (persona.anrede) {
    zeilen.push(
      `Du sprichst dein Gegenüber mit „${persona.anrede}" an — zur Begrüßung,`,
      'sonst nur, wenn es den Satz trägt. In jedem zweiten Satz wird es lästig.',
    );
  }
  zeilen.push(...STIL_REGELN[persona.stil]);
  return zeilen.join('\n');
}

/**
 * Setzt die Anrede vor einen Satz.
 *
 * Achtet darauf, den Satz danach klein anzufangen, wenn er es verträgt —
 * „Master, eine Sache wartet …" statt „Master, Eine Sache wartet …".
 */
export function mitAnrede(satz: string, persona: Persona): string {
  if (!persona.anrede || !satz) return satz;
  if (satz.startsWith(persona.anrede)) return satz;

  const ersterBuchstabe = satz[0]!;
  // Nur klein schreiben, was auch klein darf: Substantive und Namen bleiben.
  const kleinbar = /^(Eine|Ein|Es|Heute|Da|Der|Die|Das|Ich|Sie|Zwei|Drei|Vier|Fünf|\d)/.test(satz);
  const rest = kleinbar ? ersterBuchstabe.toLowerCase() + satz.slice(1) : satz;
  return `${persona.anrede}, ${rest}`;
}

/**
 * Der Satz beim Schnipsen, wenn nichts ansteht.
 *
 * Zwei Dinge machen den Unterschied zwischen „Assistent" und „Gegenüber":
 * er sagt nicht jedes Mal dasselbe, und er merkt, wenn man ihn kurz
 * hintereinander ruft. Deshalb `wievielterRuf` — beim ersten Mal am Tag
 * klingt er anders als beim vierten in zehn Minuten.
 */
export function leerbegruessung(
  persona: Persona,
  jetzt: Date,
  wievielterRuf = 0,
): string {
  const stunde = jetzt.getHours();

  if (wievielterRuf >= 3) {
    return mitAnrede(auswaehlen(WIEDERHOLT, wievielterRuf), persona);
  }
  if (wievielterRuf >= 1) {
    return mitAnrede(auswaehlen(NOCHMAL, wievielterRuf), persona);
  }

  const gruppe = stunde < 5 ? NACHTS : stunde < 11 ? MORGENS : stunde < 18 ? TAGSUEBER : ABENDS;
  // Der Minutenwert reicht als Streuung: zwei Rufe in derselben Minute sind
  // ohnehin der Wiederholungsfall.
  return mitAnrede(auswaehlen(gruppe, jetzt.getMinutes()), persona);
}

function auswaehlen(saetze: readonly string[], zaehler: number): string {
  return saetze[Math.abs(Math.trunc(zaehler)) % saetze.length]!;
}

const MORGENS = [
  'Guten Morgen. Was steht an?',
  'Moin. Womit fangen wir an?',
  'Guten Morgen. Was kann ich für Sie tun?',
] as const;

const TAGSUEBER = ['Ja?', 'Was kann ich für Sie tun?', 'Ich höre.'] as const;

const ABENDS = ['Ja, bitte?', 'Guten Abend. Was kann ich für Sie tun?', 'Ich höre.'] as const;

const NACHTS = ['Ja?', 'Noch wach? Was kann ich für Sie tun?'] as const;

/** Beim zweiten Ruf kurz hintereinander. */
const NOCHMAL = [
  'Ja, noch etwas?',
  'Sie schnipsen schon wieder. Was kann ich für Sie tun?',
  'Ich bin noch da. Was brauchen Sie?',
] as const;

/** Ab dem vierten Ruf in kurzer Zeit -- da darf er es merken. */
const WIEDERHOLT = [
  'Sie schnipsen recht häufig. Sagen Sie einfach, was Sie brauchen.',
  'Ich höre immer noch. Was kann ich tun?',
  'Wir könnten das abkürzen, wenn Sie mir sagen, worum es geht.',
] as const;
