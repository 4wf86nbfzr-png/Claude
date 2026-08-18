/**
 * Wo fängt ein Satz an, wo hört er auf?
 *
 * Die Web-Speech-Schnittstelle hat einem diese Frage abgenommen. Sie fällt in
 * Electron aber aus (Google hat die Erkennung auf Chrome selbst beschränkt),
 * also schneidet JARVIS die Äußerungen selbst zu und schickt sie an ein
 * lokales Whisper.
 *
 * Wie bei der Schnips-Erkennung liegt die Rechnung hier im Kern: sie arbeitet
 * auf reinen Zahlen und ist damit ohne Mikrofon prüfbar. Das Fenster liefert
 * nur die Pegel.
 *
 * Die Aufgabe ist ein Kompromiss zwischen zwei Ärgernissen: schneidet man zu
 * früh ab, fehlt das Satzende; wartet man zu lange, antwortet JARVIS spürbar
 * verzögert. Deshalb ist die Stille-Schwelle kürzer als bei Diktiergeräten
 * üblich und dafür der Rauschpegel gleitend nachgeführt.
 */

/** Die Abtastrate, mit der Whisper arbeitet. Etwas anderes nimmt es nicht. */
export const WHISPER_ABTASTRATE = 16_000;

export interface PegelRahmen {
  /** Zeitstempel in Millisekunden. */
  t: number;
  /** Lautstärke dieses Rahmens, 0..1. */
  rms: number;
}

export type SegmentEreignis =
  | { art: 'start'; t: number }
  | { art: 'ende'; t: number; dauerMs: number; grund: 'stille' | 'zu_lang' };

export interface SegmentOptionen {
  /** Ab dem Wievielfachen des Grundpegels gilt ein Rahmen als Sprache. */
  startFaktor: number;
  /**
   * Zum Weitersprechen genügt weniger als zum Anfangen. Ohne diese Hysterese
   * reißt die Äußerung an jedem leisen Silbenende ab.
   */
  haltFaktor: number;
  /** Absolute Untergrenze, damit Stille im stillen Raum nicht als Sprache zählt. */
  mindestLautstaerke: number;
  /** So lange muss es still sein, bevor die Äußerung als beendet gilt. */
  stoppStilleMs: number;
  /** Kürzere Äußerungen werden verworfen — Husten, Türklappen, ein Klick. */
  mindestDauerMs: number;
  /** Nach dieser Länge wird geschnitten, damit die Antwort nicht ewig hängt. */
  maxDauerMs: number;
  /**
   * Wie schnell der Grundpegel wieder steigen darf, je Rahmen. Klein halten:
   * das ist die Zeitkonstante, mit der der Segmentierer vergisst, wie leise es
   * einmal war.
   */
  vergessenProRahmen: number;
}

export const SEGMENT_STANDARD: SegmentOptionen = {
  startFaktor: 2.6,
  haltFaktor: 1.5,
  mindestLautstaerke: 0.012,
  stoppStilleMs: 750,
  mindestDauerMs: 320,
  maxDauerMs: 15_000,
  vergessenProRahmen: 0.0008,
};

export class Sprachsegmentierer {
  private readonly opt: SegmentOptionen;
  /** Startwert bewusst hoch: das Minimum fällt binnen weniger Rahmen. */
  private grundpegel = 0.05;
  private spricht = false;
  private startT = 0;
  private letzteSpracheT = 0;

  constructor(optionen: Partial<SegmentOptionen> = {}) {
    this.opt = { ...SEGMENT_STANDARD, ...optionen };
  }

  /** Läuft gerade eine Äußerung? */
  get imSatz(): boolean {
    return this.spricht;
  }

  /** Der aktuell angenommene Grundpegel des Raums — nur für Anzeige/Test. */
  get rauschen(): number {
    return this.grundpegel;
  }

  pruefe(rahmen: PegelRahmen): SegmentEreignis | null {
    const { t, rms } = rahmen;

    /*
     * Der Grundpegel ist ein *abklingendes Minimum*, kein Mittelwert. Der
     * Unterschied ist der Punkt, an dem die erste Fassung gescheitert ist: mit
     * einem Mittelwert, der nur in der Stille nachgeführt wird, bleibt der
     * Pegel in einem dauerhaft lauten Raum unten, alles gilt als Sprache und
     * die Erkennung bekommt ununterbrochen Lärm zu hören. Das Minimum wandert
     * dagegen sofort auf den Lärmteppich und nur langsam wieder hoch -- ein
     * einzelner Knall hebt es überhaupt nicht.
     */
    this.grundpegel = Math.min(rms, this.grundpegel * (1 + this.opt.vergessenProRahmen));

    const faktor = this.spricht ? this.opt.haltFaktor : this.opt.startFaktor;
    const schwelle = Math.max(this.opt.mindestLautstaerke, this.grundpegel * faktor);
    const laut = rms >= schwelle;

    if (!this.spricht) {
      if (laut) {
        this.spricht = true;
        this.startT = t;
        this.letzteSpracheT = t;
        return { art: 'start', t };
      }
      return null;
    }

    if (laut) this.letzteSpracheT = t;

    const dauerMs = t - this.startT;
    if (dauerMs >= this.opt.maxDauerMs) {
      this.spricht = false;
      return { art: 'ende', t, dauerMs, grund: 'zu_lang' };
    }

    if (t - this.letzteSpracheT >= this.opt.stoppStilleMs) {
      this.spricht = false;
      // Die Stille am Ende zählt nicht zur Äußerung.
      const echteDauer = this.letzteSpracheT - this.startT;
      if (echteDauer < this.opt.mindestDauerMs) return null; // zu kurz -- verwerfen
      return { art: 'ende', t, dauerMs: echteDauer, grund: 'stille' };
    }

    return null;
  }

  /** Setzt den Zustand zurück, ohne den gelernten Raumpegel zu verlieren. */
  zuruecksetzen(): void {
    this.spricht = false;
    this.startT = 0;
    this.letzteSpracheT = 0;
  }
}
