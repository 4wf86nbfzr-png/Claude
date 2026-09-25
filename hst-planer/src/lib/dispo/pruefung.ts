/**
 * Prüfungen vor einer Zuordnung (SecPlan 4).
 *
 * Bewusst ohne Datenbank: die Regeln bekommen alles als einfache Werte
 * übergeben. So lassen sie sich einzeln testen, und die Disposition
 * bekommt beim Ziehen eines Namens dieselbe Antwort wie der Server beim
 * Speichern – es gibt nur eine Wahrheit.
 *
 * Der Ton der Meldungen ist Absicht. „Konflikt" hilft niemandem;
 * „Bereits eingeplant: Hafenlicht Open Air, 18:00–23:00 Uhr" schon.
 */

import { shiftDuration } from '../time';

export type KonfliktArt =
  | 'GESPERRT'
  | 'UEBERSCHNEIDUNG'
  | 'ABWESEND'
  | 'QUALIFIKATION'
  | 'ABLAUF'
  | 'SCHULUNG'
  | 'DOKUMENT'
  | 'ROLLE'
  | 'RUHEZEIT';

export interface Konflikt {
  art: KonfliktArt;
  text: string;
  /** true = das Speichern wird verweigert, false = laute Warnung. */
  blockierend: boolean;
}

export interface Schicht {
  /** "HH:MM" */
  start: string | null;
  ende: string | null;
  /** Anzeigename für die Meldung, z. B. der Eventname. */
  bezeichnung?: string;
}

export interface NachweisStand {
  name: string;
  /** null = nie ablaufend */
  laeuftAb: Date | null;
  vorhanden: boolean;
}

export interface PruefEingabe {
  /** Tag des Einsatzes, auf den geprüft wird. */
  tag: Date;
  ziel: Schicht;
  person: {
    name: string;
    aktiv: boolean;
    gesperrt: boolean;
    sperrgrund?: string | null;
  };
  /** Bereits bestehende Einteilungen derselben Person am selben Tag. */
  belegt: Schicht[];
  /**
   * Einteilungen vom Vortag. Nur interessant, wenn sie über Mitternacht
   * laufen – eine Nachtschicht 22:00–06:00 blockiert den Frühdienst um
   * 05:00 am Folgetag, und genau das sieht die Tagesprüfung sonst nicht.
   */
  belegtVortag?: Schicht[];
  /** Abwesenheiten, die den Tag überdecken. */
  abwesend: Array<{ art: string; hinweis?: string | null }>;
  /** Geforderte Qualifikationen und ihr Stand bei dieser Person. */
  qualifikationen: NachweisStand[];
  /** Pflichtschulungen und ihr Stand. */
  schulungen: NachweisStand[];
  /** Pflichtdokumente (z. B. Führungszeugnis) und ihr Stand. */
  dokumente: NachweisStand[];
  /** Rolle, die auf der Position besetzt werden soll. */
  rolle?: { name: string; erlaubt: boolean; grund?: string };
  /** Ende der letzten Schicht am Vortag, "HH:MM", für die Ruhezeit. */
  vortagEnde?: string | null;
  /** Gesetzliche Mindestruhezeit in Stunden (§ 5 ArbZG: 11). */
  ruhezeitStunden?: number;
}

/** Minuten seit Mitternacht. */
function min(zeit: string): number {
  return Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));
}

/** Fenster als [Beginn, Ende] in Minuten ab Mitternacht; Nachtschicht läuft über 24:00 hinaus. */
function fenster(schicht: Schicht): [number, number] | null {
  if (!schicht.start || !schicht.ende) return null;
  const a = min(schicht.start);
  const dauer = shiftDuration(schicht.start, schicht.ende)?.grossMinutes ?? 0;
  return [a, a + dauer];
}

export function ueberschneidet(a: Schicht, b: Schicht): boolean {
  const fa = fenster(a);
  const fb = fenster(b);
  if (!fa || !fb) return false;
  return fa[0] < fb[1] && fb[0] < fa[1];
}

function zeitraum(schicht: Schicht): string {
  if (!schicht.start || !schicht.ende) return 'ohne feste Zeit';
  return `${schicht.start}–${schicht.ende} Uhr`;
}

function abgelaufen(stand: NachweisStand, tag: Date): boolean {
  return stand.vorhanden && stand.laeuftAb !== null && stand.laeuftAb < tag;
}

const ABWESENHEIT: Record<string, string> = {
  URLAUB: 'im Urlaub',
  KRANK: 'krankgemeldet',
  NICHT_VERFUEGBAR: 'als nicht verfügbar eingetragen',
};

/**
 * Alle Prüfungen aus SecPlan 4 in einem Durchgang.
 * Reihenfolge ist die Reihenfolge der Dringlichkeit – die Oberfläche
 * zeigt den ersten Eintrag als Überschrift der Warnung.
 */
export function pruefe(eingabe: PruefEingabe): Konflikt[] {
  const k: Konflikt[] = [];
  const { person, ziel, tag } = eingabe;

  // --- Status der Person ------------------------------------------------
  if (person.gesperrt) {
    k.push({
      art: 'GESPERRT',
      text: `${person.name} hat einen Sperrvermerk: ${person.sperrgrund?.trim() || 'ohne Angabe'}.`,
      blockierend: true,
    });
  }
  if (!person.aktiv) {
    k.push({ art: 'GESPERRT', text: `${person.name} ist nicht mehr aktiv.`, blockierend: true });
  }

  // --- Überschneidung ---------------------------------------------------
  for (const vorhanden of eingabe.belegt) {
    if (!ueberschneidet(ziel, vorhanden)) continue;
    const wo = vorhanden.bezeichnung ? `: ${vorhanden.bezeichnung}` : '';
    k.push({
      art: 'UEBERSCHNEIDUNG',
      text: `${person.name} ist bereits von ${zeitraum(vorhanden)} eingeplant${wo}.`,
      blockierend: true,
    });
  }

  // Nachtschichten vom Vortag: deren Fenster wird um 24 Stunden nach vorn
  // geschoben, damit es mit dem heutigen Fenster vergleichbar ist.
  for (const vorhanden of eingabe.belegtVortag ?? []) {
    const f = fenster(vorhanden);
    if (!f || f[1] <= 24 * 60) continue;   // endete noch am Vortag
    const heute: [number, number] = [0, f[1] - 24 * 60];
    const fz = fenster(ziel);
    if (!fz || !(fz[0] < heute[1] && heute[0] < fz[1])) continue;
    const wo = vorhanden.bezeichnung ? `: ${vorhanden.bezeichnung}` : '';
    k.push({
      art: 'UEBERSCHNEIDUNG',
      text: `${person.name} ist noch aus der Nachtschicht des Vortages bis ${vorhanden.ende} Uhr eingeplant${wo}.`,
      blockierend: true,
    });
  }

  // --- Rolle ------------------------------------------------------------
  if (eingabe.rolle && !eingabe.rolle.erlaubt) {
    k.push({
      art: 'ROLLE',
      text: `${person.name} ist für die Funktion „${eingabe.rolle.name}" nicht freigegeben${eingabe.rolle.grund ? ` (${eingabe.rolle.grund})` : ''}.`,
      blockierend: true,
    });
  }

  // --- Verfügbarkeit ----------------------------------------------------
  for (const a of eingabe.abwesend) {
    const wort = ABWESENHEIT[a.art] ?? `abwesend (${a.art.toLowerCase()})`;
    k.push({
      art: 'ABWESEND',
      text: `${person.name} ist an diesem Tag ${wort}${a.hinweis ? `: ${a.hinweis}` : ''}.`,
      blockierend: false,
    });
  }

  // --- Qualifikation, Schulung, Dokument --------------------------------
  const gruppen: Array<[NachweisStand[], KonfliktArt, string]> = [
    [eingabe.qualifikationen, 'QUALIFIKATION', 'Qualifikation'],
    [eingabe.schulungen, 'SCHULUNG', 'Pflichtschulung'],
    [eingabe.dokumente, 'DOKUMENT', 'Unterlage'],
  ];
  for (const [liste, art, wort] of gruppen) {
    for (const stand of liste) {
      if (!stand.vorhanden) {
        k.push({ art, text: `${wort} fehlt: ${stand.name}.`, blockierend: false });
      } else if (abgelaufen(stand, tag)) {
        const datum = stand.laeuftAb!.toLocaleDateString('de-DE');
        k.push({ art: 'ABLAUF', text: `${wort} abgelaufen am ${datum}: ${stand.name}.`, blockierend: false });
      }
    }
  }

  // --- Ruhezeit ---------------------------------------------------------
  const stunden = eingabe.ruhezeitStunden ?? 11;
  if (eingabe.vortagEnde && ziel.start) {
    // Der Vortag endet ggf. nach Mitternacht; dann ist die Pause entsprechend kürzer.
    const endeVortag = min(eingabe.vortagEnde);
    const pause = endeVortag > 12 * 60
      ? (24 * 60 - endeVortag) + min(ziel.start)   // Ende am Abend
      : min(ziel.start) - endeVortag;              // Ende nach Mitternacht
    if (pause < stunden * 60) {
      const h = Math.floor(pause / 60);
      const m = pause % 60;
      k.push({
        art: 'RUHEZEIT',
        text: `Zwischen der letzten Schicht und diesem Einsatz liegen nur ${h} Std. ${m} Min. – § 5 ArbZG verlangt ${stunden} Stunden.`,
        blockierend: false,
      });
    }
  }

  return k;
}

/** Kurzfassung für die Oberfläche: blockiert das Speichern? */
export function blockiert(konflikte: readonly Konflikt[]): boolean {
  return konflikte.some((k) => k.blockierend);
}

/** Ein Satz, der über der Warnung steht. */
export function ueberschrift(konflikte: readonly Konflikt[]): string {
  if (konflikte.length === 0) return 'Keine Einwände.';
  const harte = konflikte.filter((x) => x.blockierend).length;
  if (harte > 0) return harte === 1 ? 'Diese Zuordnung ist nicht möglich' : `${harte} Gründe sprechen gegen diese Zuordnung`;
  return konflikte.length === 1 ? 'Ein Hinweis zu dieser Zuordnung' : `${konflikte.length} Hinweise zu dieser Zuordnung`;
}
