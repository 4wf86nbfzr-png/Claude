import type { JarvisError, Result, VoiceSettings } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CredentialService } from '../services/CredentialService.js';
import type { SettingsService } from '../services/SettingsService.js';

export interface SpeechAudio {
  audio: ArrayBuffer;
  mimeType: string;
}

export interface VoiceAgentDeps {
  settings: SettingsService;
  credentials: CredentialService;
}

/**
 * Speech in and out (§7).
 *
 * Two stacks are supported and both are real:
 *  - `webspeech`: the browser engine inside the renderer. No key, no network
 *    call from our side, works offline on most systems. The renderer drives it;
 *    this class only reports that it is the active choice.
 *  - `openai` / `elevenlabs`: server-side APIs called from here, so audio never
 *    passes through the renderer's network stack.
 *
 * Which one is active is decided by settings, and `capabilities()` tells the
 * renderer what to do — there is no silent fallback that pretends speech works.
 */
export class VoiceAgent {
  readonly name = 'VoiceAgent';

  constructor(private readonly deps: VoiceAgentDeps) {}

  capabilities(): { stt: VoiceSettings['sttProvider']; tts: VoiceSettings['ttsProvider']; language: string; wakeWord: string } {
    const voice = this.deps.settings.get().voice;
    return {
      stt: this.resolveStt(voice),
      tts: this.resolveTts(voice),
      language: voice.language,
      wakeWord: voice.wakeWord,
    };
  }

  /** Falls back to the built-in engine when the configured service has no key. */
  private resolveStt(voice: VoiceSettings): VoiceSettings['sttProvider'] {
    if (voice.sttProvider === 'openai' && !this.deps.credentials.get('openai.apiKey')) return 'webspeech';
    return voice.sttProvider;
  }

  private resolveTts(voice: VoiceSettings): VoiceSettings['ttsProvider'] {
    if (voice.ttsProvider === 'openai' && !this.deps.credentials.get('openai.apiKey')) return 'webspeech';
    if (voice.ttsProvider === 'elevenlabs' && !this.deps.credentials.get('elevenlabs.apiKey')) return 'webspeech';
    return voice.ttsProvider;
  }

  /* ---------------------------------------------------------------- */
  /* Speech to text                                                    */
  /* ---------------------------------------------------------------- */

  async transcribe(audio: ArrayBuffer, mimeType: string): Promise<Result<string, JarvisError>> {
    const voice = this.deps.settings.get().voice;
    if (voice.sttProvider !== 'openai') {
      return err(
        makeError(
          'voice.stt_not_server_side',
          `Die Spracherkennung ist auf „${voice.sttProvider}" gestellt und läuft im Fenster, nicht auf dem Server.`,
        ),
      );
    }
    const key = this.deps.credentials.get('openai.apiKey');
    if (!key) {
      return err(
        makeError('voice.no_key', 'Für die Whisper-Spracherkennung fehlt der OpenAI-Schlüssel.', {
          hint: 'Einstellungen → Zugänge → OpenAI API Key.',
        }),
      );
    }

    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), fileNameFor(mimeType));
    form.append('model', 'whisper-1');
    form.append('language', voice.language.split('-')[0] ?? 'de');
    form.append('response_format', 'json');

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: form,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return err(
          makeError('voice.stt_failed', `Die Spracherkennung meldete HTTP ${response.status}.`, {
            detail: text.slice(0, 300),
            retryable: response.status >= 500,
          }),
        );
      }
      const json = (await response.json()) as { text?: string };
      const transcript = (json.text ?? '').trim();
      if (!transcript) {
        return err(makeError('voice.stt_empty', 'Es wurde nichts verstanden.', { retryable: true }));
      }
      return ok(transcript);
    } catch (error) {
      return err(
        makeError('voice.stt_offline', 'Der Spracherkennungsdienst ist nicht erreichbar.', {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }

  /* ---------------------------------------------------------------- */
  /* Text to speech                                                    */
  /* ---------------------------------------------------------------- */

  async synthesize(text: string): Promise<Result<SpeechAudio, JarvisError>> {
    const voice = this.deps.settings.get().voice;
    const trimmed = text.trim();
    if (!trimmed) return err(makeError('voice.empty_text', 'Es wurde kein Text zum Vorlesen übergeben.'));

    switch (this.resolveTts(voice)) {
      case 'openai':
        return this.synthesizeOpenAi(trimmed, voice);
      case 'elevenlabs':
        return this.synthesizeElevenLabs(trimmed, voice);
      case 'webspeech':
        return err(
          makeError(
            'voice.tts_client_side',
            'Die Sprachausgabe läuft im Fenster (Web Speech) und wird dort erzeugt.',
          ),
        );
      case 'off':
      default:
        return err(makeError('voice.tts_off', 'Die Sprachausgabe ist abgeschaltet.'));
    }
  }

  private async synthesizeOpenAi(text: string, voice: VoiceSettings): Promise<Result<SpeechAudio, JarvisError>> {
    const key = this.deps.credentials.get('openai.apiKey');
    if (!key) {
      return err(
        makeError('voice.no_key', 'Für die OpenAI-Sprachausgabe fehlt der Schlüssel.', {
          hint: 'Einstellungen → Zugänge → OpenAI API Key.',
        }),
      );
    }
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: voice.voice || 'alloy',
          input: text.slice(0, 4000),
          response_format: 'mp3',
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return err(
          makeError('voice.tts_failed', `Die Sprachausgabe meldete HTTP ${response.status}.`, {
            detail: detail.slice(0, 300),
          }),
        );
      }
      return ok({ audio: await response.arrayBuffer(), mimeType: 'audio/mpeg' });
    } catch (error) {
      return err(
        makeError('voice.tts_offline', 'Der Sprachausgabedienst ist nicht erreichbar.', {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }

  private async synthesizeElevenLabs(
    text: string,
    voice: VoiceSettings,
  ): Promise<Result<SpeechAudio, JarvisError>> {
    const key = this.deps.credentials.get('elevenlabs.apiKey');
    if (!key) {
      return err(
        makeError('voice.no_key', 'Für ElevenLabs fehlt der API-Schlüssel.', {
          hint: 'Einstellungen → Zugänge → ElevenLabs API Key.',
        }),
      );
    }
    const voiceId = voice.voice || '21m00Tcm4TlvDq8ikWAM';
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: text.slice(0, 4000),
          model_id: 'eleven_multilingual_v2',
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return err(
          makeError('voice.tts_failed', `ElevenLabs meldete HTTP ${response.status}.`, {
            detail: detail.slice(0, 300),
          }),
        );
      }
      return ok({ audio: await response.arrayBuffer(), mimeType: 'audio/mpeg' });
    } catch (error) {
      return err(
        makeError('voice.tts_offline', 'ElevenLabs ist nicht erreichbar.', {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }
}

function fileNameFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'aufnahme.webm';
  if (mimeType.includes('ogg')) return 'aufnahme.ogg';
  if (mimeType.includes('wav')) return 'aufnahme.wav';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'aufnahme.m4a';
  return 'aufnahme.bin';
}
