import type { JarvisEnv } from '../config/env.js';
import type { CredentialService } from '../services/credentials.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenAiProvider } from './openai.js';
import type { LlmProvider } from './types.js';

export * from './types.js';
export { AnthropicProvider, ANTHROPIC_DEFAULT_MODEL } from './anthropic.js';
export { OpenAiProvider, OPENAI_DEFAULT_MODEL } from './openai.js';
export { OllamaProvider, OLLAMA_DEFAULT_MODEL } from './ollama.js';

export function createLlmProvider(env: JarvisEnv, credentials: CredentialService): LlmProvider {
  switch (env.JARVIS_LLM_PROVIDER) {
    case 'openai':
      return new OpenAiProvider({
        apiKey: credentials.get('OPENAI_API_KEY'),
        baseUrl: env.OPENAI_BASE_URL,
        model: env.JARVIS_LLM_MODEL,
      });
    case 'ollama':
      return new OllamaProvider({ baseUrl: env.OLLAMA_BASE_URL, model: env.JARVIS_LLM_MODEL });
    case 'anthropic':
    default:
      return new AnthropicProvider({
        apiKey: credentials.get('ANTHROPIC_API_KEY'),
        baseUrl: env.ANTHROPIC_BASE_URL,
        model: env.JARVIS_LLM_MODEL,
      });
  }
}
