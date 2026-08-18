/**
 * Welche Stimme spricht.
 *
 * Der Unterschied zwischen „Computerstimme" und „klingt wie ein Mensch" ist
 * unter macOS keine Frage der Technik, sondern der installierten Datei. Das
 * System bringt ab Werk die kompakte Fassung mit — blechern, mit hörbaren
 * Übergängen. Die guten Stimmen („Premium", „Erweitert", Siri) sind mehrere
 * hundert Megabyte groß und müssen einmal geladen werden; danach stehen sie
 * derselben Schnittstelle zur Verfügung.
 *
 * Diese Auswahl steckt deshalb hier im Kern und nicht im Fenster: sie ist
 * reine Sortierung nach Namen und Sprache und damit ohne Browser prüfbar.
 */

export interface StimmenEintrag {
  name: string;
  lang: string;
  /** Läuft die Stimme auf dem Gerät? Netzstimmen klingen oft besser, aber
   *  schicken den Text weg -- deshalb hier nachrangig. */
  localService?: boolean;
  default?: boolean;
}

/**
 * Namensbestandteile, die eine hochwertige Fassung verraten, absteigend nach
 * Güte. macOS schreibt sie je nach Systemsprache unterschiedlich.
 */
const GUETE: readonly { muster: RegExp; punkte: number }[] = [
  { muster: /\bsiri\b/i, punkte: 60 },
  { muster: /premium|neural/i, punkte: 50 },
  { muster: /enhanced|erweitert/i, punkte: 40 },
  { muster: /\bnatural\b/i, punkte: 35 },
  { muster: /google/i, punkte: 20 },
  { muster: /compact|kompakt/i, punkte: -20 },
  // „Eddy", „Flo", „Grandma" & Co. sind Spaßstimmen und für einen Assistenten
  // unbrauchbar -- sie kommen unter macOS aber in derselben Liste.
  { muster: /eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|bahh|bells|boing|bubbles|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bad news|good news|cellos|deranged|hysterical/i, punkte: -100 },
];

export interface StimmwahlOptionen {
  /** Bevorzugte Sprache, z. B. `de-DE`. */
  sprache?: string;
  /** Ein vom Benutzer festgelegter Name. Gewinnt, wenn er vorhanden ist. */
  wunsch?: string | null;
}

/** Bewertet eine Stimme. Höher ist besser; negative Werte sind unbrauchbar. */
export function bewerteStimme(stimme: StimmenEintrag, sprache = 'de'): number {
  const sprachBasis = sprache.split('-')[0]!.toLowerCase();
  if (!stimme.lang?.toLowerCase().startsWith(sprachBasis)) return -1000;

  let punkte = 0;
  for (const { muster, punkte: p } of GUETE) {
    if (muster.test(stimme.name)) punkte += p;
  }
  // Genau passendes Land vor bloß passender Sprache: „de-DE" vor „de-AT".
  if (stimme.lang.toLowerCase() === sprache.toLowerCase()) punkte += 5;
  if (stimme.localService) punkte += 2;
  return punkte;
}

/**
 * Sucht die beste verfügbare Stimme aus.
 *
 * Ein ausdrücklicher Wunsch gewinnt immer — auch eine Spaßstimme, wenn jemand
 * das so will. Ohne Wunsch entscheidet die Bewertung; gibt es nichts in der
 * Sprache, bleibt es bei `null` und der Aufrufer überlässt es dem System.
 */
export function waehleStimme(
  stimmen: readonly StimmenEintrag[],
  optionen: StimmwahlOptionen = {},
): StimmenEintrag | null {
  const sprache = optionen.sprache ?? 'de-DE';

  if (optionen.wunsch) {
    const genau = stimmen.find((s) => s.name === optionen.wunsch);
    if (genau) return genau;
  }

  let beste: StimmenEintrag | null = null;
  let bestwert = -Infinity;
  for (const stimme of stimmen) {
    const wert = bewerteStimme(stimme, sprache);
    if (wert <= -1000) continue;
    if (wert > bestwert) {
      bestwert = wert;
      beste = stimme;
    }
  }
  return beste;
}

/**
 * Lohnt sich ein Hinweis, dass es bessere Stimmen zum Nachladen gibt?
 *
 * Nur dann, wenn tatsächlich keine hochwertige Fassung installiert ist —
 * einen Hinweis, den man nicht abstellen kann und der nichts ändert, will
 * niemand zweimal lesen.
 */
export function bessereStimmeVerfuegbar(stimmen: readonly StimmenEintrag[], sprache = 'de-DE'): boolean {
  const passende = stimmen.filter((s) => bewerteStimme(s, sprache) > -1000);
  if (passende.length === 0) return false;
  return !passende.some((s) => /siri|premium|neural|enhanced|erweitert/i.test(s.name));
}
