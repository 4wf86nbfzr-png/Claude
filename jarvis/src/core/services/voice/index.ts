import type { ProviderHealth } from '../../../shared/types';
import type { JarvisConfig } from '../config';
import type { CredentialService } from '../credentials';
import {
  ElevenLabsTtsProvider,
  FensterSttProvider,
  FensterTtsProvider,
  OpenAiSttProvider,
  OpenAiTtsProvider
} from './providers';
import type { SprachAusgabe, SttProvider, Transkript, TtsProvider } from './types';

export * from './types';
export * from './providers';

export function createSttProvider(config: JarvisConfig, credentials: CredentialService): SttProvider {
  if (config.stt.provider === 'openai-kompatibel') {
    const baseUrl = config.stt.baseUrl ?? 'https://api.openai.com/v1';
    return new OpenAiSttProvider({
      apiKey: credentials.getFirst('JARVIS_STT_API_KEY', 'OPENAI_API_KEY'),
      baseUrl,
      model: config.stt.model,
      language: config.stt.language,
      keyOptional: /localhost|127\.0\.0\.1/.test(baseUrl)
    });
  }
  return new FensterSttProvider();
}

export function createTtsProvider(config: JarvisConfig, credentials: CredentialService): TtsProvider {
  if (config.tts.provider === 'openai-kompatibel') {
    const baseUrl = config.tts.baseUrl ?? 'https://api.openai.com/v1';
    return new OpenAiTtsProvider({
      apiKey: credentials.getFirst('JARVIS_TTS_API_KEY', 'OPENAI_API_KEY'),
      baseUrl,
      model: config.tts.model,
      voice: config.tts.voice,
      keyOptional: /localhost|127\.0\.0\.1/.test(baseUrl)
    });
  }
  if (config.tts.provider === 'elevenlabs') {
    return new ElevenLabsTtsProvider(credentials.get('ELEVENLABS_API_KEY'), config.tts.voice);
  }
  return new FensterTtsProvider();
}

/**
 * Bündelt Spracherkennung und Sprachausgabe (§7).
 *
 * Läuft die Umsetzung im Fenster, meldet der Dienst das ausdrücklich zurück –
 * die Oberfläche schaltet dann auf die eingebauten Browserfunktionen um,
 * statt eine Antwort vorzutäuschen.
 */
export class VoiceService {
  constructor(
    readonly stt: SttProvider,
    readonly tts: TtsProvider
  ) {}

  static create(config: JarvisConfig, credentials: CredentialService): VoiceService {
    return new VoiceService(createSttProvider(config, credentials), createTtsProvider(config, credentials));
  }

  status(): { stt: ProviderHealth[]; tts: ProviderHealth[] } {
    return {
      stt: [
        {
          id: this.stt.id,
          label: this.stt.label,
          configured: this.stt.configured(),
          hint: this.stt.missingHint()
        }
      ],
      tts: [
        {
          id: this.tts.id,
          label: this.tts.label,
          configured: this.tts.configured(),
          hint: this.tts.missingHint()
        }
      ]
    };
  }

  async transkribiere(audio: Buffer, mimeType: string): Promise<Transkript & { imFenster?: boolean }> {
    if (this.stt.imFenster) return { text: '', imFenster: true };
    return this.stt.transcribe(audio, mimeType);
  }

  async sprich(text: string, stimme?: string): Promise<(SprachAusgabe & { imFenster?: boolean }) | { imFenster: true; audio: null }> {
    if (this.tts.imFenster) return { imFenster: true, audio: null };
    return this.tts.synthesize(text, stimme);
  }
}
