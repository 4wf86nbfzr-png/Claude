import { EMPFINDLICHKEITEN, SchnipsErkenner, type Empfindlichkeit } from '@jarvis/core/schnips';

/**
 * Mikrofon-Dauerbetrieb mit Schnips-Auslöser.
 *
 * Wichtig zur Einordnung: das Mikrofon ist offen, solange das eingeschaltet
 * ist. Die Audiodaten werden aber **nur im Fenster** analysiert — es wird
 * nichts aufgezeichnet, nichts gespeichert und nichts verschickt. Was den
 * Rechner verlässt, verlässt ihn erst, wenn Sie nach dem Auslöser wirklich
 * sprechen und die Erkennung anspringt.
 *
 * Die eigentliche Erkennungslogik liegt im Kern (`voice/schnips.ts`) und ist
 * dort ohne Mikrofon getestet. Hier steht nur die Audio-Anbindung.
 */

export interface SchnipserOptionen {
  empfindlichkeit: Empfindlichkeit;
  /** Zwei Schnipser nötig — deutlich weniger Fehlauslöser. */
  doppelschnipsen: boolean;
  onSchnips: () => void;
  onPegel?: (pegel: number) => void;
  onFehler: (meldung: string) => void;
}

export interface Schnipser {
  stoppen(): void;
  laeuft(): boolean;
}

/** Wie oft der Pegel ausgewertet wird. Kleiner = genauer, aber mehr Last. */
const RAHMEN_MS = 16;

export async function starteSchnipser(optionen: SchnipserOptionen): Promise<Schnipser | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Keine Vorverarbeitung: die Automatiken bügeln genau die Transiente
        // weg, an der ein Schnipsen erkennbar ist.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    optionen.onFehler(
      name === 'NotAllowedError'
        ? 'Der Zugriff auf das Mikrofon wurde abgelehnt. Ohne Mikrofon kein Schnipsen.'
        : `Das Mikrofon ließ sich nicht öffnen: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }

  const kontext = new AudioContext();
  const quelle = kontext.createMediaStreamSource(stream);
  const analyse = kontext.createAnalyser();
  analyse.fftSize = 1024;
  analyse.smoothingTimeConstant = 0; // Glättung würde die Flanke verschlucken
  quelle.connect(analyse);

  const zeitPuffer = new Uint8Array(analyse.fftSize);
  const frequenzPuffer = new Uint8Array(analyse.frequencyBinCount);

  // Ab welchem Frequenzfach „hoch" beginnt (~2 kHz).
  const hzProFach = kontext.sampleRate / 2 / analyse.frequencyBinCount;
  const grenzFach = Math.floor(2000 / hzProFach);

  const erkenner = new SchnipsErkenner({
    ...EMPFINDLICHKEITEN[optionen.empfindlichkeit],
    ...(optionen.doppelschnipsen ? { doppelFensterMs: 1200 } : {}),
  });

  let aktiv = true;
  const timer = window.setInterval(() => {
    if (!aktiv) return;

    analyse.getByteTimeDomainData(zeitPuffer);
    let summe = 0;
    for (const wert of zeitPuffer) {
      const d = (wert - 128) / 128;
      summe += d * d;
    }
    const rms = Math.sqrt(summe / zeitPuffer.length);

    analyse.getByteFrequencyData(frequenzPuffer);
    let tief = 0;
    let hoch = 0;
    for (let i = 0; i < frequenzPuffer.length; i += 1) {
      if (i < grenzFach) tief += frequenzPuffer[i]!;
      else hoch += frequenzPuffer[i]!;
    }
    const gesamt = tief + hoch;
    const hochanteil = gesamt > 0 ? hoch / gesamt : 0;

    optionen.onPegel?.(Math.min(1, rms * 3.2));

    if (erkenner.pruefe({ t: performance.now(), rms, hochanteil })) {
      optionen.onSchnips();
    }
  }, RAHMEN_MS);

  return {
    stoppen() {
      aktiv = false;
      window.clearInterval(timer);
      for (const spur of stream.getTracks()) spur.stop();
      void kontext.close();
    },
    laeuft: () => aktiv,
  };
}
