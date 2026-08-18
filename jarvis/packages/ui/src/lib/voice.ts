/**
 * Sprache im Fenster.
 *
 * Erkennung und Ausgabe laufen standardmäßig über die Web-Speech-Schnittstelle
 * des Browsers: das kostet nichts, braucht keinen Schlüssel und schickt bei
 * der Ausgabe keine Daten irgendwohin. Ist im Kern ein Anbieter mit Schlüssel
 * eingestellt, übernimmt dieser -- die Oberfläche nimmt dann nur auf und
 * spielt die zurückgelieferte Datei ab.
 */

type ErkennungsEreignis = {
  text: string;
  endgueltig: boolean;
};

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function erkennungsKlasse(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const spracherkennungVerfuegbar = (): boolean => erkennungsKlasse() !== null;
export const sprachausgabeVerfuegbar = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

export interface Diktat {
  start(): void;
  stop(): void;
  laeuft(): boolean;
}

/** Fortlaufendes Diktat mit Zwischenergebnissen. */
export function starteDiktat(optionen: {
  onText: (e: ErkennungsEreignis) => void;
  /** `code` ist der rohe Fehlerschlüssel der Erkennung, z. B. `no-speech`. */
  onFehler: (meldung: string, code: string) => void;
  onEnde?: () => void;
  sprache?: string;
}): Diktat | null {
  const Klasse = erkennungsKlasse();
  if (!Klasse) return null;

  const erkennung = new Klasse();
  erkennung.lang = optionen.sprache ?? 'de-DE';
  erkennung.continuous = true;
  erkennung.interimResults = true;
  erkennung.maxAlternatives = 1;

  let aktiv = false;

  erkennung.onresult = (e) => {
    let zwischen = '';
    let endgueltig = '';
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const treffer = e.results[i];
      if (!treffer) continue;
      if (treffer.isFinal) endgueltig += treffer[0].transcript;
      else zwischen += treffer[0].transcript;
    }
    if (endgueltig) optionen.onText({ text: endgueltig.trim(), endgueltig: true });
    else if (zwischen) optionen.onText({ text: zwischen.trim(), endgueltig: false });
  };

  erkennung.onerror = (e) => {
    aktiv = false;
    const meldungen: Record<string, string> = {
      'not-allowed': 'Der Zugriff auf das Mikrofon wurde abgelehnt.',
      'service-not-allowed': 'Die Spracherkennung ist auf diesem System nicht freigegeben.',
      'audio-capture': 'Es ist kein Mikrofon da, an das die Erkennung herankommt.',
      'no-speech': 'Es war nichts zu hören.',
      network: 'Die Spracherkennung ist nicht erreichbar.',
      aborted: '',
    };
    const meldung = meldungen[e.error] ?? `Spracherkennung fehlgeschlagen (${e.error}).`;
    if (meldung) optionen.onFehler(meldung, e.error);
  };

  erkennung.onend = () => {
    aktiv = false;
    optionen.onEnde?.();
  };

  return {
    start() {
      if (aktiv) return;
      try {
        erkennung.start();
        aktiv = true;
      } catch (e) {
        optionen.onFehler(e instanceof Error ? e.message : String(e), 'start');
      }
    },
    stop() {
      if (!aktiv) return;
      erkennung.stop();
      aktiv = false;
    },
    laeuft: () => aktiv,
  };
}

/** Sprachausgabe über das Betriebssystem. */
export function sprich(text: string, optionen: { unterbrechen?: boolean; sprache?: string } = {}): void {
  if (!sprachausgabeVerfuegbar() || !text.trim()) return;
  if (optionen.unterbrechen) window.speechSynthesis.cancel();

  const aeusserung = new SpeechSynthesisUtterance(vorlesbar(text));
  aeusserung.lang = optionen.sprache ?? 'de-DE';
  aeusserung.rate = 1.02;
  aeusserung.pitch = 1;

  const stimmen = window.speechSynthesis.getVoices();
  const deutsch = stimmen.find((s) => s.lang.startsWith('de') && /google|siri|premium|natural/i.test(s.name))
    ?? stimmen.find((s) => s.lang.startsWith('de'));
  if (deutsch) aeusserung.voice = deutsch;

  window.speechSynthesis.speak(aeusserung);
}

export function schweig(): void {
  if (sprachausgabeVerfuegbar()) window.speechSynthesis.cancel();
}

/**
 * Räumt Text fürs Vorlesen auf: Kennungen, URLs und Aufzählungszeichen
 * klingen gesprochen furchtbar.
 */
export function vorlesbar(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, 'Link')
    .replace(/\b(mail|co|apr|tgt|camp|src|em|ct|fct)_[a-z0-9]{6,}\b/gi, 'die Kennung')
    .replace(/^[-*•]\s*/gm, '')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aufnahme für die serverseitige Transkription.
 * Liefert die Aufnahme als ArrayBuffer, den der Kern an den Anbieter schickt.
 */
export async function starteAufnahme(): Promise<{
  stop: () => Promise<ArrayBuffer>;
  pegel: () => number;
  abbrechen: () => void;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: bevorzugtesFormat() });
  const teile: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) teile.push(e.data);
  };
  recorder.start();

  // Pegelmessung für den Orb.
  const kontext = new AudioContext();
  const quelle = kontext.createMediaStreamSource(stream);
  const analyse = kontext.createAnalyser();
  analyse.fftSize = 512;
  quelle.connect(analyse);
  const puffer = new Uint8Array(analyse.frequencyBinCount);

  const aufraeumen = () => {
    for (const spur of stream.getTracks()) spur.stop();
    void kontext.close();
  };

  return {
    pegel() {
      analyse.getByteTimeDomainData(puffer);
      let summe = 0;
      for (const wert of puffer) {
        const abweichung = (wert - 128) / 128;
        summe += abweichung * abweichung;
      }
      return Math.min(1, Math.sqrt(summe / puffer.length) * 3.2);
    },
    stop() {
      return new Promise<ArrayBuffer>((resolve) => {
        recorder.onstop = async () => {
          aufraeumen();
          resolve(await new Blob(teile, { type: recorder.mimeType }).arrayBuffer());
        };
        recorder.stop();
      });
    },
    abbrechen() {
      try {
        recorder.stop();
      } catch {
        /* war schon gestoppt */
      }
      aufraeumen();
    },
  };
}

function bevorzugtesFormat(): string {
  for (const typ of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(typ)) return typ;
  }
  return '';
}
