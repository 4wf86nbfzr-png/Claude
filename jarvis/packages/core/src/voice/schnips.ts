/**
 * Schnipser-Erkennung.
 *
 * Ein Fingerschnipsen ist akustisch sehr charakteristisch: ein extrem
 * kurzer, breitbandiger Knall mit steiler Flanke und viel Hochtonanteil,
 * der innerhalb von etwa 100 Millisekunden wieder weg ist. Sprache ist
 * dagegen dumpfer und hält an, Türenschlagen ist tieffrequent.
 *
 * Die Erkennung arbeitet auf vorverarbeiteten Rahmen (Lautstärke und
 * Hochtonanteil), nicht auf rohen Audiodaten. Das hat einen praktischen
 * Grund: so laesst sie sich ohne Mikrofon und ohne Browser testen -- und
 * genau das passiert in `schnips.test.ts`.
 *
 * Ehrlich zur Genauigkeit: eine rein akustische Erkennung ohne trainiertes
 * Modell hat Fehlauslöser. Klatschen, ein zufallender Deckel oder ein harter
 * Tastenanschlag können ähnlich aussehen. Dagegen helfen drei Dinge, die
 * hier eingebaut sind: eine einstellbare Empfindlichkeit, eine Sperrzeit
 * nach jedem Treffer, und wahlweise Doppelschnipsen.
 */

export interface Rahmen {
  /** Zeitpunkt in Millisekunden (monoton steigend). */
  t: number;
  /** Effektivwert der Lautstärke, 0..1. */
  rms: number;
  /** Anteil der Energie oberhalb ~2 kHz, 0..1. */
  hochanteil: number;
}

export interface SchnipsOptionen {
  /**
   * Wie viel lauter als der gleitende Grundpegel es werden muss.
   * Kleiner = empfindlicher.
   */
  attackFaktor: number;
  /** Absolute Untergrenze, damit Stille nicht triggert. */
  mindestLautstaerke: number;
  /** Ein Schnipsen ist hell. Sprache liegt deutlich darunter. */
  mindestHochanteil: number;
  /** Innerhalb dieser Zeit muss der Knall wieder abgeklungen sein (ms). */
  abklingzeitMs: number;
  /** Sperrzeit nach einem ausgelösten Treffer (ms). */
  sperrzeitMs: number;
  /**
   * Kurze Sperre nach *jedem* erkannten Knall (ms).
   *
   * Nötig, weil ein Schnipsen im Abklingen noch einmal über der Schwelle
   * liegen kann -- ohne diese Sperre zählt ein Schnipsen als zwei, was im
   * Doppelschnipsen-Modus sofort auslösen würde.
   */
  ereignisSperreMs: number;
  /** Zwei Schnipser innerhalb dieser Zeit nötig (ms); 0 = einfaches Schnipsen. */
  doppelFensterMs: number;
}

export const SCHNIPS_STANDARD: SchnipsOptionen = {
  attackFaktor: 4.5,
  mindestLautstaerke: 0.08,
  mindestHochanteil: 0.35,
  abklingzeitMs: 130,
  sperrzeitMs: 900,
  ereignisSperreMs: 250,
  doppelFensterMs: 0,
};

/** Vorgefertigte Stufen für die Oberfläche. */
export const EMPFINDLICHKEITEN = {
  streng: { ...SCHNIPS_STANDARD, attackFaktor: 6, mindestLautstaerke: 0.12, mindestHochanteil: 0.45 },
  normal: SCHNIPS_STANDARD,
  locker: { ...SCHNIPS_STANDARD, attackFaktor: 3.2, mindestLautstaerke: 0.05, mindestHochanteil: 0.25 },
} as const;

export type Empfindlichkeit = keyof typeof EMPFINDLICHKEITEN;

interface Kandidat {
  t: number;
  spitze: number;
}

/**
 * Zustandsbehafteter Erkenner. Pro Rahmen einmal `pruefe` aufrufen;
 * liefert true, wenn in diesem Moment ein Schnipsen erkannt wurde.
 */
export class SchnipsErkenner {
  private readonly optionen: SchnipsOptionen;
  /** Gleitender Grundpegel des Raums. */
  private grundpegel = 0.01;
  private kandidat: Kandidat | null = null;
  private letzterTrefferT = -Infinity;
  /** Zeitpunkt des letzten erkannten Knalls, ausgeloest oder nicht. */
  private letzterSchnipsT = -Infinity;
  /** Fuer das Doppelschnipsen. */
  private ersterSchnipsT = -Infinity;

  constructor(optionen: Partial<SchnipsOptionen> = {}) {
    this.optionen = { ...SCHNIPS_STANDARD, ...optionen };
  }

  /** Setzt den gelernten Grundpegel zurueck (z. B. nach Raumwechsel). */
  zuruecksetzen(): void {
    this.grundpegel = 0.01;
    this.kandidat = null;
    this.letzterTrefferT = -Infinity;
    this.letzterSchnipsT = -Infinity;
    this.ersterSchnipsT = -Infinity;
  }

  get aktuellerGrundpegel(): number {
    return this.grundpegel;
  }

  pruefe(rahmen: Rahmen): boolean {
    const o = this.optionen;

    // Zwei Sperren: die lange nach einem ausgelösten Treffer, die kurze nach
    // jedem erkannten Knall -- damit das Abklingen nicht als zweiter zählt.
    const gesperrt =
      rahmen.t - this.letzterTrefferT < o.sperrzeitMs || rahmen.t - this.letzterSchnipsT < o.ereignisSperreMs;
    if (gesperrt) {
      this.kandidat = null;
      this.langsamAnpassen(rahmen.rms);
      return false;
    }

    // Läuft gerade ein Kandidat? Dann auf das Abklingen warten.
    if (this.kandidat) {
      const vergangen = rahmen.t - this.kandidat.t;
      const abgeklungen = rahmen.rms < this.kandidat.spitze * 0.4;

      if (abgeklungen && vergangen <= o.abklingzeitMs) {
        this.kandidat = null;
        return this.trefferMelden(rahmen.t);
      }
      if (vergangen > o.abklingzeitMs) {
        // Zu lang -- das war Sprache oder ein Dauergeräusch, kein Schnipsen.
        this.kandidat = null;
        this.langsamAnpassen(rahmen.rms);
      }
      return false;
    }

    // Neuer Kandidat?
    const istKnall =
      rahmen.rms >= o.mindestLautstaerke &&
      rahmen.rms > this.grundpegel * o.attackFaktor &&
      rahmen.hochanteil >= o.mindestHochanteil;

    if (istKnall) {
      this.kandidat = { t: rahmen.t, spitze: rahmen.rms };
      return false;
    }

    this.langsamAnpassen(rahmen.rms);
    return false;
  }

  /**
   * Der Grundpegel folgt dem Raum, aber traege -- sonst „gewöhnt" er sich
   * an ein lautes Geräusch und der Schnipser geht darin unter.
   */
  private langsamAnpassen(rms: number): void {
    const gewicht = rms > this.grundpegel ? 0.02 : 0.15;
    this.grundpegel = this.grundpegel * (1 - gewicht) + rms * gewicht;
    if (this.grundpegel < 0.002) this.grundpegel = 0.002;
  }

  private trefferMelden(t: number): boolean {
    // Jeder erkannte Knall setzt die kurze Sperre -- unabhaengig davon, ob er
    // schon auslöst.
    this.letzterSchnipsT = t;

    if (this.optionen.doppelFensterMs > 0) {
      const seitErstem = t - this.ersterSchnipsT;
      if (seitErstem <= this.optionen.doppelFensterMs) {
        this.ersterSchnipsT = -Infinity;
        this.letzterTrefferT = t;
        return true;
      }
      // Erster Schnipser -- auf den zweiten warten, aber keine Sperrzeit setzen.
      this.ersterSchnipsT = t;
      return false;
    }

    this.letzterTrefferT = t;
    return true;
  }
}
