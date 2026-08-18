/**
 * Sprachein- und -ausgabe im Fenster.
 *
 * Zwei Wege, je nachdem, was eingerichtet ist:
 *  - "kern":   Aufnahme im Fenster, Erkennung im Hauptprozess (Whisper o. ä.).
 *  - "fenster": Erkennung über die eingebaute Spracherkennung von Chromium.
 *
 * Steht keiner von beiden bereit, meldet die Klasse das im Klartext, statt
 * eine Erkennung vorzutäuschen.
 */
export type SttModus = 'fenster' | 'kern';

interface SpeechRecognitionErgebnis {
  results: { isFinal: boolean; 0: { transcript: string } }[];
  resultIndex: number;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionErgebnis) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionKonstruktor = new () => SpeechRecognitionLike;

const holeErkennung = (): SpeechRecognitionKonstruktor | null => {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionKonstruktor;
    webkitSpeechRecognition?: SpeechRecognitionKonstruktor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export class Sprachsteuerung {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private stuecke: Blob[] = [];
  private audioKontext: AudioContext | null = null;
  private pegelSchleife: number | null = null;
  private erkennung: SpeechRecognitionLike | null = null;
  private erkannt = '';
  private erkennungsFehler: string | null = null;
  private ausgabe: HTMLAudioElement | null = null;

  get laeuft(): boolean {
    return Boolean(this.recorder || this.erkennung);
  }

  async starteAufnahme(modus: SttModus, onPegel: (wert: number) => void): Promise<void> {
    if (modus === 'fenster') {
      const Erkennung = holeErkennung();
      if (!Erkennung) {
        throw new Error(
          'Die eingebaute Spracherkennung steht hier nicht zur Verfügung. Bitte in den Einstellungen einen ' +
            'Spracherkennungsdienst hinterlegen (JARVIS_STT_PROVIDER = openai-kompatibel).'
        );
      }
      this.erkannt = '';
      this.erkennungsFehler = null;
      const erkennung = new Erkennung();
      erkennung.lang = 'de-DE';
      erkennung.continuous = true;
      erkennung.interimResults = true;
      erkennung.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const treffer = event.results[i];
          if (treffer?.isFinal) this.erkannt += `${treffer[0].transcript} `;
        }
      };
      erkennung.onerror = (event) => {
        this.erkennungsFehler =
          event.error === 'not-allowed'
            ? 'Der Zugriff auf das Mikrofon wurde abgelehnt.'
            : `Spracherkennung meldete: ${event.error}. Für zuverlässige Erkennung einen eigenen Dienst hinterlegen.`;
      };
      erkennung.start();
      this.erkennung = erkennung;
    }

    // Mikrofonpegel wird in beiden Fällen für die Kugel gebraucht.
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.beobachtePegel(this.stream, onPegel);

    if (modus === 'kern') {
      this.stuecke = [];
      const typ = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      this.recorder = new MediaRecorder(this.stream, { mimeType: typ });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.stuecke.push(event.data);
      };
      this.recorder.start(250);
    }
  }

  /** Beendet die Aufnahme und liefert den erkannten Text. */
  async beendeAufnahme(): Promise<string> {
    const recorder = this.recorder;
    const erkennung = this.erkennung;
    this.recorder = null;
    this.erkennung = null;

    let text = '';
    if (recorder) {
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(this.stuecke, { type: recorder.mimeType }));
        recorder.stop();
      });
      const puffer = await blob.arrayBuffer();
      const ergebnis = await window.jarvis.transkribieren(puffer, recorder.mimeType);
      this.raeumeAuf();
      if (ergebnis.fehler) throw new Error(ergebnis.fehler);
      text = ergebnis.text;
    }

    if (erkennung) {
      await new Promise<void>((resolve) => {
        erkennung.onend = () => resolve();
        erkennung.stop();
        globalThis.setTimeout(resolve, 800);
      });
      this.raeumeAuf();
      if (this.erkennungsFehler) throw new Error(this.erkennungsFehler);
      text = this.erkannt.trim();
    }

    this.raeumeAuf();
    return text.trim();
  }

  abbrechen(): void {
    try {
      this.recorder?.stop();
      this.erkennung?.stop();
    } catch {
      // Beim Abbrechen ist ein Fehler nicht weiter wichtig.
    }
    this.recorder = null;
    this.erkennung = null;
    this.raeumeAuf();
  }

  private beobachtePegel(stream: MediaStream, onPegel: (wert: number) => void): void {
    const kontext = new AudioContext();
    const quelle = kontext.createMediaStreamSource(stream);
    const analyse = kontext.createAnalyser();
    analyse.fftSize = 512;
    quelle.connect(analyse);
    const puffer = new Uint8Array(analyse.frequencyBinCount);
    this.audioKontext = kontext;

    const schritt = () => {
      analyse.getByteTimeDomainData(puffer);
      let summe = 0;
      for (const wert of puffer) summe += (wert - 128) ** 2;
      onPegel(Math.min(1, Math.sqrt(summe / puffer.length) / 40));
      this.pegelSchleife = requestAnimationFrame(schritt);
    };
    schritt();
  }

  private raeumeAuf(): void {
    if (this.pegelSchleife !== null) cancelAnimationFrame(this.pegelSchleife);
    this.pegelSchleife = null;
    void this.audioKontext?.close().catch(() => undefined);
    this.audioKontext = null;
    this.stream?.getTracks().forEach((spur) => spur.stop());
    this.stream = null;
  }

  /** Liest Text vor – über den eingerichteten Dienst oder die Systemstimme. */
  async sprich(text: string): Promise<void> {
    this.stoppSprechen();
    const ergebnis = await window.jarvis.sprechen(text);
    if (!ergebnis.imFenster && ergebnis.audioBase64) {
      const audio = new Audio(`data:${ergebnis.mimeType ?? 'audio/mpeg'};base64,${ergebnis.audioBase64}`);
      this.ausgabe = audio;
      await audio.play();
      return;
    }
    if (!('speechSynthesis' in window)) {
      throw new Error(ergebnis.fehler ?? 'Auf diesem Rechner steht keine Sprachausgabe zur Verfügung.');
    }
    const aeusserung = new SpeechSynthesisUtterance(text);
    aeusserung.lang = 'de-DE';
    aeusserung.rate = 1.02;
    const stimme = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'));
    if (stimme) aeusserung.voice = stimme;
    window.speechSynthesis.speak(aeusserung);
  }

  stoppSprechen(): void {
    if (this.ausgabe) {
      this.ausgabe.pause();
      this.ausgabe = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}
