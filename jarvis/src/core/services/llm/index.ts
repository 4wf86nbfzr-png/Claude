import type { JarvisConfig } from '../config';
import type { CredentialService } from '../credentials';
import { AnthropicProvider } from './anthropic';
import { OpenAiCompatibleProvider } from './openaiCompatible';
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './types';

export * from './types';
export { AnthropicProvider } from './anthropic';
export { OpenAiCompatibleProvider } from './openaiCompatible';

/** Platzhalter, solange kein Modell eingerichtet ist – meldet ehrlich, was fehlt. */
export class NichtEingerichtetProvider implements LlmProvider {
  readonly id = 'keiner';
  readonly label = 'Kein Sprachmodell eingerichtet';
  configured(): boolean {
    return false;
  }
  missingHint(): string {
    return 'JARVIS_LLM_PROVIDER auf "anthropic" oder "openai-kompatibel" setzen und den Schlüssel hinterlegen.';
  }
  async complete(): Promise<LlmResponse> {
    throw new LlmError(
      'Es ist kein Sprachmodell eingerichtet. Bitte in den Einstellungen einen Anbieter wählen und den Schlüssel hinterlegen.',
      this.id
    );
  }
}

export function createLlmProvider(config: JarvisConfig, credentials: CredentialService): LlmProvider {
  switch (config.llm.provider) {
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: credentials.get('ANTHROPIC_API_KEY'),
        model: config.llm.model,
        baseUrl: config.llm.baseUrl,
        maxTokens: config.llm.maxTokens
      });
    case 'openai-kompatibel':
      return new OpenAiCompatibleProvider({
        apiKey: credentials.get('OPENAI_API_KEY'),
        model: config.llm.model,
        baseUrl: config.llm.baseUrl ?? 'https://api.openai.com/v1',
        maxTokens: config.llm.maxTokens,
        keyOptional: Boolean(config.llm.baseUrl && /localhost|127\.0\.0\.1/.test(config.llm.baseUrl))
      });
    default:
      return new NichtEingerichtetProvider();
  }
}

export type { LlmRequest };
