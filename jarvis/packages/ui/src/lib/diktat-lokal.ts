import { Sprachsegmentierer, WHISPER_ABTASTRATE } from '@jarvis/core/segmente';
import { befehl } from './bridge.js';
import type { Diktat } from './voice.js';

/**
 * Diktat über die lokale Erkennung.
 *
 * Ersetzt die Web-Speech-Schnittstelle, die in Electron nicht funktioniert
 * (Google beschränkt den Dienst dahinter auf Chrome selbst). Der Ablauf:
 *
 *   Mikrofon → Pegel je Rahmen → Segmentierer sagt „Satz fertig"
 *            → Abtastwerte auf 16 kHz umrechnen → Kern → Whisper → Text
 *
 * Zwischenergebnisse gibt es dabei nicht: Whisper erkennt eine fertige
 * Äußerung, nicht Silbe für Silbe. Statt einer mitlaufenden Vorschau meldet
 * das Diktat deshalb „Ich höre …", solange gesprochen wird — das ist ehrlicher
 * als ein Text, der sich noch fünfmal umschreibt.
 *
 * Eigene Stimme: der Aufnahmestrom läuft **mit** Echounterdrückung, damit
 * JARVIS nicht sich selbst zuhört. Der Schnips-Erkenner braucht genau das
 * Gegenteil und hat deshalb einen eigenen Strom.
 */

/** Wie oft der Pegel gemessen wird. */
const RAHMEN_MS = 20;
/** So viel Ton vor dem erkannten Anfang wird mitgeschickt. */
const VORLAUF_MS = 300;

export interface LokalesDiktatOptionen {
  onText: (e: { text: string; endgueltig: boolean }) => void;
  onFehler: (meldung: string, code: string) => void;
  onEnde?: () => void;
  /** Meldet, ob gerade gesprochen wird — für die Anzeige. */
  onAktivitaet?: (spricht: boolean) => void;
}

export function starteLokalesDiktat(optionen: LokalesDiktatOptionen): Diktat {
  let aktiv = false;
  let stream: MediaStream | null = null;
  let kontext: AudioContext | null = null;
  let knoten: ScriptProcessorNode | null = null;
  let messer: number | null = null;

  const segmentierer = new Sprachsegmentierer();
  /** Ringpuffer für den Vorlauf, damit die erste Silbe nicht fehlt. */
  let vorlauf: Float32Array[] = [];
  let aufnahme: Float32Array[] = [];
  let nimmtAuf = false;
  let abtastrate = 48_000;

  const aufraeumen = () => {
    if (messer !== null) window.clearInterval(messer);
    messer = null;
    knoten?.disconnect();
    knoten = null;
    for (const spur of stream?.getTracks() ?? []) spur.stop();
    stream = null;
    void kontext?.close();
    kontext = null;
    vorlauf = [];
    aufnahme = [];
    nimmtAuf = false;
  };

  const beenden = () => {
    if (!aktiv) return;
    aktiv = false;
    aufraeumen();
    optionen.onEnde?.();
  };

  const abschicken = async (stuecke: Float32Array[]) => {
    const pcm = zusammenfuegen(stuecke);
    if (pcm.length === 0) return;

    const gerechnet = await aufTeilrate(pcm, abtastrate, WHISPER_ABTASTRATE);
    if (!aktiv) return;

    // Der Puffer geht als übertragbares Objekt an den Kern -- kein Kopieren.
    const antwort = await befehl({ kind: 'voice.transcribePcm', pcm: gerechnet.buffer as ArrayBuffer });
    if (!aktiv) return;

    if (!antwort.ok) {
      optionen.onFehler(antwort.error.message, antwort.error.code === 'NOT_CONFIGURED' ? 'start' : 'erkennung');
      return;
    }
    const text = (antwort.data as { text: string }).text.trim();
    if (text) optionen.onText({ text, endgueltig: true });
  };

  const starten = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      optionen.onFehler(
        name === 'NotAllowedError'
          ? 'Der Zugriff auf das Mikrofon wurde abgelehnt.'
          : `Das Mikrofon ließ sich nicht öffnen: ${e instanceof Error ? e.message : String(e)}`,
        name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture',
      );
      beenden();
      return;
    }
    if (!aktiv) {
      aufraeumen();
      return;
    }

    kontext = new AudioContext();
    abtastrate = kontext.sampleRate;
    const quelle = kontext.createMediaStreamSource(stream);

    const analyse = kontext.createAnalyser();
    analyse.fftSize = 1024;
    analyse.smoothingTimeConstant = 0.2;
    quelle.connect(analyse);

    /*
     * ScriptProcessorNode ist als veraltet markiert, und der Nachfolger
     * AudioWorklet wäre der sauberere Weg. Der braucht aber ein Modul über
     * eine URL -- und die Inhaltsrichtlinie des Fensters lässt weder blob:
     * noch fremde Skripte zu. Für einen lokalen Datenstrom ohne Netzweg ist
     * der alte Knoten hier die ehrlichere Wahl als eine aufgeweichte CSP.
     */
    knoten = kontext.createScriptProcessor(4096, 1, 1);
    const vorlaufRahmen = Math.ceil((VORLAUF_MS / 1000) * abtastrate / 4096);

    knoten.onaudioprocess = (e) => {
      const daten = new Float32Array(e.inputBuffer.getChannelData(0));
      if (nimmtAuf) {
        aufnahme.push(daten);
      } else {
        vorlauf.push(daten);
        if (vorlauf.length > vorlaufRahmen) vorlauf.shift();
      }
    };
    quelle.connect(knoten);
    // Ohne Ziel läuft der Knoten in manchen Browsern nicht an. Die Verstärkung
    // steht auf null, es ist also nichts zu hören.
    const stumm = kontext.createGain();
    stumm.gain.value = 0;
    knoten.connect(stumm);
    stumm.connect(kontext.destination);

    const puffer = new Uint8Array(analyse.fftSize);
    messer = window.setInterval(() => {
      if (!aktiv || !kontext) return;
      analyse.getByteTimeDomainData(puffer);
      let summe = 0;
      for (const wert of puffer) {
        const d = (wert - 128) / 128;
        summe += d * d;
      }
      const rms = Math.sqrt(summe / puffer.length);

      const ereignis = segmentierer.pruefe({ t: performance.now(), rms });
      if (!ereignis) return;

      if (ereignis.art === 'start') {
        nimmtAuf = true;
        aufnahme = [...vorlauf];
        vorlauf = [];
        optionen.onAktivitaet?.(true);
        optionen.onText({ text: '…', endgueltig: false });
      } else {
        nimmtAuf = false;
        optionen.onAktivitaet?.(false);
        const stuecke = aufnahme;
        aufnahme = [];
        void abschicken(stuecke);
      }
    }, RAHMEN_MS);
  };

  return {
    start() {
      if (aktiv) return;
      aktiv = true;
      void starten();
    },
    stop() {
      beenden();
    },
    laeuft: () => aktiv,
  };
}

function zusammenfuegen(stuecke: Float32Array[]): Float32Array {
  const gesamt = stuecke.reduce((n, s) => n + s.length, 0);
  const ziel = new Float32Array(gesamt);
  let pos = 0;
  for (const s of stuecke) {
    ziel.set(s, pos);
    pos += s.length;
  }
  return ziel;
}

/**
 * Rechnet auf die Abtastrate um, die Whisper erwartet.
 *
 * Über einen OfflineAudioContext statt von Hand: der bringt den Tiefpass mit,
 * ohne den beim Heruntertasten Aliasing entsteht — und Aliasing hört sich für
 * ein Erkennungsmodell wie ein anderes Wort an.
 */
async function aufTeilrate(pcm: Float32Array, von: number, nach: number): Promise<Float32Array> {
  if (von === nach) return pcm;
  const laenge = Math.max(1, Math.round((pcm.length * nach) / von));
  const offline = new OfflineAudioContext(1, laenge, nach);
  const puffer = offline.createBuffer(1, pcm.length, von);
  puffer.getChannelData(0).set(pcm);
  const quelle = offline.createBufferSource();
  quelle.buffer = puffer;
  quelle.connect(offline.destination);
  quelle.start();
  const fertig = await offline.startRendering();
  return new Float32Array(fertig.getChannelData(0));
}
