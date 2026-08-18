import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '../util/result.js';
import { WHISPER_ABTASTRATE } from './segmente.js';

/**
 * Spracherkennung auf dem eigenen Rechner.
 *
 * Warum das überhaupt sein muss: die Web-Speech-Schnittstelle des Browsers
 * wäre der bequeme Weg, funktioniert in Electron aber nicht. Google hat den
 * Dienst dahinter auf Chrome selbst beschränkt; in einer Electron-Anwendung
 * antwortet er mit `network` bzw. `service-not-allowed`
 * (electron/electron#7749). Ohne eigene Erkennung wäre die Sprachbedienung
 * der Desktop-App also taub — deshalb läuft hier ein Whisper-Modell lokal.
 *
 * Passt zur Grundhaltung des Projekts: kein Schlüssel nötig, kein Ton verlässt
 * den Rechner. Der Preis ist ein einmaliger Modell-Download und etwas
 * Rechenzeit je Äußerung.
 *
 * Die Bibliothek wird **absichtlich erst bei Bedarf** geladen. Sie zieht
 * onnxruntime mit nativen Binärdateien nach; wer JARVIS ohne Spracheingabe
 * betreibt (Konsole, Tests, Server), soll das nicht bezahlen.
 */

/** Was von der Erkennung zurückkommt. */
export interface LokaleTranskription {
  text: string;
  modell: string;
  /** Wie lange die Erkennung gebraucht hat — für die ehrliche Rückmeldung. */
  dauerMs: number;
}

/**
 * Die Modelle, zwischen denen die Einrichtung wählen lässt. Deutsch ist für
 * Whisper spürbar schwerer als Englisch: `tiny` verhaspelt sich bei Namen und
 * Fachbegriffen regelmäßig, deshalb ist `base` die Untergrenze für den
 * Alltag und `small` die Empfehlung, wenn die Maschine es hergibt.
 */
export interface ModellWahl {
  kennung: string;
  name: string;
  groesseMb: number;
  eignung: string;
}

export const WHISPER_MODELLE: readonly ModellWahl[] = [
  {
    kennung: 'onnx-community/whisper-base',
    name: 'Whisper base',
    groesseMb: 145,
    eignung: 'Reicht für kurze Anweisungen. Bei Namen und Fachbegriffen ungenau.',
  },
  {
    kennung: 'onnx-community/whisper-small',
    name: 'Whisper small',
    groesseMb: 490,
    eignung: 'Empfohlen. Versteht deutsche Sätze zuverlässig, braucht spürbar mehr Rechenzeit.',
  },
  {
    kennung: 'onnx-community/whisper-large-v3-turbo',
    name: 'Whisper large v3 turbo',
    groesseMb: 1620,
    eignung: 'Beste Erkennung. Nur sinnvoll auf einer Maschine mit reichlich Arbeitsspeicher.',
  },
] as const;

export const WHISPER_STANDARD = 'onnx-community/whisper-small';

export { WHISPER_ABTASTRATE } from './segmente.js';

/**
 * Die Form, die uns von der Bibliothek interessiert. So klein gehalten, damit
 * die Tests eine Attrappe einsetzen können, ohne das echte Modell zu laden.
 */
export type ErkennungsPipeline = (
  audio: Float32Array,
  optionen: Record<string, unknown>,
) => Promise<{ text?: string } | Array<{ text?: string }>>;

/** Meldet den Ladefortschritt einer einzelnen Datei. */
export interface Ladefortschritt {
  datei: string;
  /** 0..100, oder null, solange die Größe noch unbekannt ist. */
  prozent: number | null;
}

export type PipelineFabrik = (
  modell: string,
  cacheDir: string,
  onFortschritt?: (f: Ladefortschritt) => void,
) => Promise<ErkennungsPipeline>;

export interface LokaleErkennungOptionen {
  modell?: string;
  /** Wohin die Modelldateien geladen werden. */
  modellDir: string;
  /** Nur für Tests: ersetzt das Laden der echten Bibliothek. */
  erzeugePipeline?: PipelineFabrik;
  /** Nur für Tests: liefert die aktuelle Zeit. */
  jetzt?: () => number;
}

/** Lädt transformers.js und baut die echte Pipeline. */
const echteFabrik: PipelineFabrik = async (modell, cacheDir, onFortschritt) => {
  // Der dynamische Import ist Absicht (siehe Kopfkommentar) und muss vor
  // TypeScript verborgen bleiben, solange das Paket optional ist.
  const spezifizierer = '@huggingface/transformers';
  const mod = (await import(/* @vite-ignore */ spezifizierer)) as {
    env: { cacheDir: string; allowLocalModels: boolean };
    pipeline: (aufgabe: string, modell: string, optionen?: Record<string, unknown>) => Promise<ErkennungsPipeline>;
  };
  mod.env.cacheDir = cacheDir;
  mod.env.allowLocalModels = true;
  return mod.pipeline('automatic-speech-recognition', modell, {
    dtype: 'q8',
    // Der Download geht über mehrere hundert Megabyte. Ohne Rückmeldung sieht
    // die Oberfläche dabei aus, als hinge sie.
    progress_callback: (e: { status?: string; file?: string; progress?: number }) => {
      if (!onFortschritt || e.status !== 'progress') return;
      onFortschritt({
        datei: e.file ?? '',
        prozent: typeof e.progress === 'number' ? Math.round(e.progress) : null,
      });
    },
  });
};

export class LokaleErkennung {
  private readonly modell: string;
  private readonly modellDir: string;
  private readonly fabrik: PipelineFabrik;
  private readonly jetzt: () => number;
  private pipeline: ErkennungsPipeline | null = null;
  /** Damit paralleles Laden nicht zweimal dasselbe Modell zieht. */
  private ladevorgang: Promise<Result<ErkennungsPipeline>> | null = null;

  constructor(optionen: LokaleErkennungOptionen) {
    this.modell = optionen.modell ?? WHISPER_STANDARD;
    this.modellDir = optionen.modellDir;
    this.fabrik = optionen.erzeugePipeline ?? echteFabrik;
    this.jetzt = optionen.jetzt ?? (() => Date.now());
  }

  get modellKennung(): string {
    return this.modell;
  }

  get geladen(): boolean {
    return this.pipeline !== null;
  }

  /**
   * Liegt das Modell schon auf der Platte? Wichtig für die Einrichtung: beim
   * ersten Mal wird ein paar hundert Megabyte geladen, und das soll niemanden
   * mitten in einem Gespräch überraschen.
   */
  get heruntergeladen(): boolean {
    return existsSync(join(this.modellDir, ...this.modell.split('/')));
  }

  /** Lädt das Modell (beim ersten Mal inklusive Download). */
  async laden(onFortschritt?: (f: Ladefortschritt) => void): Promise<Result<{ modell: string; dauerMs: number }>> {
    const start = this.jetzt();
    const r = await this.hole(onFortschritt);
    if (!r.ok) return r;
    return ok({ modell: this.modell, dauerMs: this.jetzt() - start });
  }

  private async hole(onFortschritt?: (f: Ladefortschritt) => void): Promise<Result<ErkennungsPipeline>> {
    if (this.pipeline) return ok(this.pipeline);
    if (!this.ladevorgang) {
      this.ladevorgang = (async (): Promise<Result<ErkennungsPipeline>> => {
        try {
          const p = await this.fabrik(this.modell, this.modellDir, onFortschritt);
          this.pipeline = p;
          return ok(p);
        } catch (e) {
          const meldung = e instanceof Error ? e.message : String(e);
          const fehlt = /cannot find module|ERR_MODULE_NOT_FOUND/i.test(meldung);
          return err(
            fehlt ? 'NOT_CONFIGURED' : 'PROVIDER_ERROR',
            fehlt
              ? 'Die lokale Spracherkennung ist nicht installiert.'
              : `Das Spracherkennungsmodell ließ sich nicht laden: ${meldung}`,
            {
              hint: fehlt
                ? 'npm run stimme richtet sie ein (einmaliger Download).'
                : 'Ohne Netz kann das Modell beim ersten Mal nicht geladen werden.',
            },
          );
        } finally {
          this.ladevorgang = null;
        }
      })();
    }
    return this.ladevorgang;
  }

  /**
   * Wandelt Abtastwerte in Text.
   *
   * `pcm` muss einkanalig und mit {@link WHISPER_ABTASTRATE} abgetastet sein —
   * das Umrechnen passiert im Fenster, wo die Audiodaten ohnehin schon liegen.
   */
  async transkribiere(pcm: Float32Array, sprache = 'de'): Promise<Result<LokaleTranskription>> {
    if (pcm.length === 0) {
      return err('INVALID_INPUT', 'Es wurden keine Audiodaten übergeben.');
    }
    // Whisper arbeitet in 30-Sekunden-Fenstern; darunter ist alles in Ordnung,
    // darüber müsste stückweise erkannt werden. Wir schneiden vorher zu.
    const sekunden = pcm.length / WHISPER_ABTASTRATE;
    if (sekunden > 30) {
      return err('INVALID_INPUT', `Die Aufnahme ist mit ${sekunden.toFixed(0)} s zu lang (höchstens 30 s).`);
    }

    const p = await this.hole();
    if (!p.ok) return p;

    const start = this.jetzt();
    try {
      const roh = await p.data(pcm, { language: sprache, task: 'transcribe' });
      const text = (Array.isArray(roh) ? (roh[0]?.text ?? '') : (roh.text ?? '')).trim();
      return ok({ text: saeubere(text), modell: this.modell, dauerMs: this.jetzt() - start });
    } catch (e) {
      return err('PROVIDER_ERROR', `Die Erkennung ist fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * Whisper setzt bei Stille gern Platzhalter aus den Trainingsdaten ein —
 * Untertitelzeilen wie „Untertitelung des ZDF, 2020" oder „Vielen Dank."
 * Die stehen dann als vermeintliche Anweisung im Gespräch. Wer sie nicht
 * herausfiltert, bekommt Antworten auf Sätze, die niemand gesagt hat.
 */
const HALLUZINATIONEN = [
  /^untertitel(ung|ung des zdf|:| von).*/i,
  /^untertitel im auftrag des zdf.*/i,
  /^(vielen dank|danke|tschüss|bis zum nächsten mal)[.!]?$/i,
  /^copyright.*/i,
  /^amara\.org.*/i,
  /^(mbc|swr|zdf|ard)\b.*(\d{4})\.?$/i,
  /^\s*thanks for watching[.!]?\s*$/i,
];

export function saeubere(text: string): string {
  const sauber = text.replace(/\s+/g, ' ').trim();
  if (!sauber) return '';
  if (HALLUZINATIONEN.some((r) => r.test(sauber))) return '';
  // Reine Satzzeichen sind kein Satz.
  if (!/[a-zäöüß0-9]/i.test(sauber)) return '';
  return sauber;
}
