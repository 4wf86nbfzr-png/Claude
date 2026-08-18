import { VoiceError, type SprachAusgabe, type SttProvider, type Transkript, type TtsProvider } from './types';

/**
 * Spracherkennung und -ausgabe im Fenster.
 *
 * Chromiums Web Speech API bzw. `speechSynthesis` erledigen die Arbeit im
 * Renderer. Der Kern hält diesen Anbieter nur, damit die Oberfläche weiß,
 * dass sie zuständig ist – und damit es ohne Schlüssel sofort funktioniert.
 */
export class FensterSttProvider implements SttProvider {
  readonly id = 'browser';
  readonly label = 'Spracherkennung im Fenster';
  readonly imFenster = true;
  configured(): boolean {
    return true;
  }
  missingHint(): string {
    return 'Nutzt die Spracherkennung des Fensters. Für Diktate ohne Internetdienst einen lokalen Whisper-Server eintragen.';
  }
  async transcribe(): Promise<Transkript> {
    throw new VoiceError('Diese Spracherkennung läuft im Fenster und wird nicht im Kern aufgerufen.', this.id);
  }
}

export class FensterTtsProvider implements TtsProvider {
  readonly id = 'browser';
  readonly label = 'Sprachausgabe im Fenster';
  readonly imFenster = true;
  configured(): boolean {
    return true;
  }
  missingHint(): string {
    return 'Nutzt die Systemstimmen des Betriebssystems.';
  }
  async synthesize(): Promise<SprachAusgabe> {
    throw new VoiceError('Diese Sprachausgabe läuft im Fenster und wird nicht im Kern aufgerufen.', this.id);
  }
}

export interface OpenAiVoiceOptions {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  language?: string;
  voice?: string;
  keyOptional?: boolean;
}

/** Spracherkennung über eine OpenAI-kompatible Schnittstelle (auch lokaler Whisper-Server). */
export class OpenAiSttProvider implements SttProvider {
  readonly id = 'openai-kompatibel';
  readonly label = 'Spracherkennung (OpenAI-kompatibel)';
  readonly imFenster = false;

  constructor(private readonly options: OpenAiVoiceOptions) {}

  configured(): boolean {
    return Boolean(this.options.baseUrl) && (this.options.keyOptional === true || Boolean(this.options.apiKey));
  }
  missingHint(): string {
    return 'JARVIS_STT_BASE_URL und einen Schlüssel (JARVIS_STT_API_KEY oder OPENAI_API_KEY) hinterlegen.';
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<Transkript> {
    if (!this.configured()) throw new VoiceError(this.missingHint(), this.id);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `aufnahme.${endung(mimeType)}`);
    form.append('model', this.options.model);
    if (this.options.language) form.append('language', this.options.language);
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {},
      body: form
    });
    if (!response.ok) {
      throw new VoiceError(`Spracherkennung antwortete mit HTTP ${response.status}.`, this.id);
    }
    const data = (await response.json()) as { text?: string; language?: string };
    return { text: (data.text ?? '').trim(), ...(data.language ? { sprache: data.language } : {}) };
  }
}

/** Sprachausgabe über eine OpenAI-kompatible Schnittstelle. */
export class OpenAiTtsProvider implements TtsProvider {
  readonly id = 'openai-kompatibel';
  readonly label = 'Sprachausgabe (OpenAI-kompatibel)';
  readonly imFenster = false;

  constructor(private readonly options: OpenAiVoiceOptions) {}

  configured(): boolean {
    return Boolean(this.options.baseUrl) && (this.options.keyOptional === true || Boolean(this.options.apiKey));
  }
  missingHint(): string {
    return 'JARVIS_TTS_BASE_URL und einen Schlüssel (JARVIS_TTS_API_KEY oder OPENAI_API_KEY) hinterlegen.';
  }

  async synthesize(text: string, stimme?: string): Promise<SprachAusgabe> {
    if (!this.configured()) throw new VoiceError(this.missingHint(), this.id);
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/audio/speech`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.options.model,
        voice: stimme ?? this.options.voice ?? 'onyx',
        input: text,
        response_format: 'mp3'
      })
    });
    if (!response.ok) throw new VoiceError(`Sprachausgabe antwortete mit HTTP ${response.status}.`, this.id);
    return { audio: Buffer.from(await response.arrayBuffer()), mimeType: 'audio/mpeg' };
  }
}

export class ElevenLabsTtsProvider implements TtsProvider {
  readonly id = 'elevenlabs';
  readonly label = 'ElevenLabs';
  readonly imFenster = false;

  constructor(
    private readonly apiKey: string | null,
    private readonly voiceId: string
  ) {}

  configured(): boolean {
    return Boolean(this.apiKey && this.voiceId);
  }
  missingHint(): string {
    return 'ELEVENLABS_API_KEY hinterlegen und JARVIS_TTS_VOICE auf die Stimmen-ID setzen.';
  }

  async synthesize(text: string, stimme?: string): Promise<SprachAusgabe> {
    if (!this.configured()) throw new VoiceError(this.missingHint(), this.id);
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(stimme ?? this.voiceId)}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey ?? '', 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' })
      }
    );
    if (!response.ok) throw new VoiceError(`ElevenLabs antwortete mit HTTP ${response.status}.`, this.id);
    return { audio: Buffer.from(await response.arrayBuffer()), mimeType: 'audio/mpeg' };
  }
}

const endung = (mimeType: string): string => {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  return 'mp3';
};
