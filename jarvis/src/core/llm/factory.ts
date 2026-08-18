import type { LlmSettings, Result, JarvisError } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CredentialService } from '../services/CredentialService.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider } from './openaiCompatible.js';
import type { LlmProvider } from './types.js';

/**
 * Builds the configured provider, or explains exactly what is missing.
 * Returning a Result (rather than a half-working stub) is what keeps the UI
 * from pretending the assistant is ready when it is not.
 */
export function createLlmProvider(
  settings: LlmSettings,
  credentials: CredentialService,
): Result<LlmProvider, JarvisError> {
  switch (settings.provider) {
    case 'anthropic': {
      const key = credentials.get('anthropic.apiKey');
      if (!key) {
        return err(
          makeError('llm.no_key', 'Es ist kein Anthropic-API-Schlüssel hinterlegt.', {
            hint: 'Einstellungen → Zugänge → Anthropic API Key, oder ANTHROPIC_API_KEY setzen.',
          }),
        );
      }
      return ok(new AnthropicProvider(key, settings.model, settings.baseUrl));
    }
    case 'openai': {
      const key = credentials.get('openai.apiKey');
      if (!key) {
        return err(
          makeError('llm.no_key', 'Es ist kein OpenAI-API-Schlüssel hinterlegt.', {
            hint: 'Einstellungen → Zugänge → OpenAI API Key, oder OPENAI_API_KEY setzen.',
          }),
        );
      }
      return ok(
        new OpenAICompatibleProvider(key, settings.model, settings.baseUrl ?? 'https://api.openai.com/v1', 'openai'),
      );
    }
    case 'ollama':
      // Local runtime — no credential, OpenAI-compatible surface.
      return ok(
        new OpenAICompatibleProvider(
          null,
          settings.model,
          settings.baseUrl ?? 'http://127.0.0.1:11434/v1',
          'ollama',
        ),
      );
    default:
      return err(makeError('llm.unknown_provider', `Unbekannter Anbieter: ${String(settings.provider)}`));
  }
}
