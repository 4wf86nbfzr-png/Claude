import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JarvisEnv } from '../config/env.js';
import type { CredentialService } from '../services/credentials.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { newId } from '../util/text.js';

/**
 * Sprache ein und aus.
 *
 * Zwei Betriebsarten:
 *  - 'browser': Erkennung und Ausgabe laufen im Fenster ueber die Web-Speech-
 *    Schnittstelle. Kostet nichts, braucht keinen Schluessel, die Qualitaet
 *    haengt am Betriebssystem. Der Core hat dabei nichts zu tun -- er meldet
 *    das nur zurueck, damit die Oberflaeche weiss, dass sie selbst ran muss.
 *  - Anbieter mit Schluessel: die Audiodaten laufen durch den Core.
 */

export interface TranscriptionResult {
  text: string;
  provider: string;
  language?: string;
}

export interface SpeechResult {
  /** Pfad zur erzeugten Audiodatei. */
  path: string;
  mimeType: string;
  provider: string;
}

export interface VoiceStatus {
  stt: { provider: string; bereit: boolean; imFenster: boolean; hinweis: string | null };
  tts: { provider: string; bereit: boolean; imFenster: boolean; hinweis: string | null };
}

export class VoiceService {
  constructor(
    private readonly env: JarvisEnv,
    private readonly credentials: CredentialService,
    private readonly audioDir: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  status(): VoiceStatus {
    const openAiKey = this.credentials.get('OPENAI_API_KEY');
    const elevenKey = this.credentials.get('ELEVENLABS_API_KEY');

    const stt = this.env.JARVIS_STT_PROVIDER;
    const tts = this.env.JARVIS_TTS_PROVIDER;

    return {
      stt: {
        provider: stt,
        imFenster: stt === 'browser',
        bereit: stt === 'browser' || (stt === 'openai' && Boolean(openAiKey)),
        hinweis:
          stt === 'openai' && !openAiKey
            ? 'OPENAI_API_KEY fehlt — ohne Schlüssel keine Transkription über OpenAI.'
            : stt === 'none'
              ? 'Spracheingabe ist abgeschaltet (JARVIS_STT_PROVIDER=none).'
              : null,
      },
      tts: {
        provider: tts,
        imFenster: tts === 'browser',
        bereit:
          tts === 'browser' ||
          (tts === 'openai' && Boolean(openAiKey)) ||
          (tts === 'elevenlabs' && Boolean(elevenKey)),
        hinweis:
          tts === 'openai' && !openAiKey
            ? 'OPENAI_API_KEY fehlt — ohne Schlüssel keine Sprachausgabe über OpenAI.'
            : tts === 'elevenlabs' && !elevenKey
              ? 'ELEVENLABS_API_KEY fehlt.'
              : tts === 'none'
                ? 'Sprachausgabe ist abgeschaltet (JARVIS_TTS_PROVIDER=none).'
                : null,
      },
    };
  }

  /** Wandelt Audiodaten in Text. */
  async transcribe(audio: Buffer, filename = 'aufnahme.webm'): Promise<Result<TranscriptionResult>> {
    const provider = this.env.JARVIS_STT_PROVIDER;
    if (provider === 'browser') {
      return err('NOT_IMPLEMENTED', 'Die Spracherkennung läuft im Fenster (Web Speech API), nicht im Kern.', {
        hint: 'Das ist kein Fehler — die Oberfläche übernimmt die Erkennung selbst.',
      });
    }
    if (provider === 'none') {
      return err('NOT_CONFIGURED', 'Spracheingabe ist abgeschaltet (JARVIS_STT_PROVIDER=none).');
    }

    const key = this.credentials.get('OPENAI_API_KEY');
    if (!key) {
      return err('NOT_CONFIGURED', 'OPENAI_API_KEY fehlt.', { hint: 'Schlüssel in den Einstellungen hinterlegen.' });
    }

    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)]), filename);
      form.append('model', 'whisper-1');
      form.append('language', 'de');

      const res = await this.fetchImpl(`${this.env.OPENAI_BASE_URL.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: form,
      });
      const text = await res.text();
      if (!res.ok) {
        return err('PROVIDER_ERROR', `Transkription fehlgeschlagen (HTTP ${res.status}): ${text.slice(0, 300)}`);
      }
      const json = JSON.parse(text) as { text?: string };
      return ok({ text: (json.text ?? '').trim(), provider: 'openai', language: 'de' });
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    }
  }

  /** Erzeugt eine Audiodatei aus Text. */
  async speak(text: string): Promise<Result<SpeechResult>> {
    const provider = this.env.JARVIS_TTS_PROVIDER;
    if (provider === 'browser') {
      return err('NOT_IMPLEMENTED', 'Die Sprachausgabe läuft im Fenster (SpeechSynthesis), nicht im Kern.', {
        hint: 'Das ist kein Fehler — die Oberfläche spricht den Text selbst aus.',
      });
    }
    if (provider === 'none') {
      return err('NOT_CONFIGURED', 'Sprachausgabe ist abgeschaltet (JARVIS_TTS_PROVIDER=none).');
    }

    const gekuerzt = text.length > 4000 ? `${text.slice(0, 4000)} …` : text;

    try {
      if (provider === 'elevenlabs') {
        const key = this.credentials.get('ELEVENLABS_API_KEY');
        const voice = this.credentials.get('ELEVENLABS_VOICE_ID') ?? this.env.ELEVENLABS_VOICE_ID;
        if (!key) return err('NOT_CONFIGURED', 'ELEVENLABS_API_KEY fehlt.');
        if (!voice) return err('NOT_CONFIGURED', 'ELEVENLABS_VOICE_ID fehlt (Stimme in der ElevenLabs-Bibliothek auswählen).');

        const res = await this.fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
          method: 'POST',
          headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({ text: gekuerzt, model_id: 'eleven_multilingual_v2' }),
        });
        if (!res.ok) {
          return err('PROVIDER_ERROR', `ElevenLabs antwortete mit HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        }
        return this.writeAudio(Buffer.from(await res.arrayBuffer()), 'mp3', 'audio/mpeg', 'elevenlabs');
      }

      const key = this.credentials.get('OPENAI_API_KEY');
      if (!key) return err('NOT_CONFIGURED', 'OPENAI_API_KEY fehlt.');
      const res = await this.fetchImpl(`${this.env.OPENAI_BASE_URL.replace(/\/$/, '')}/audio/speech`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: this.env.JARVIS_TTS_VOICE,
          input: gekuerzt,
          response_format: 'mp3',
        }),
      });
      if (!res.ok) {
        return err('PROVIDER_ERROR', `Sprachausgabe fehlgeschlagen (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
      }
      return this.writeAudio(Buffer.from(await res.arrayBuffer()), 'mp3', 'audio/mpeg', 'openai');
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    }
  }

  private async writeAudio(data: Buffer, ext: string, mimeType: string, provider: string): Promise<Result<SpeechResult>> {
    const path = join(this.audioDir, `${newId('tts')}.${ext}`);
    await writeFile(path, data, { mode: 0o600 });
    return ok({ path, mimeType, provider });
  }
}
