/**
 * Auswahl des Sprachmodells. Wechselt der Anbieter in den Einstellungen,
 * wird beim nächsten Aufruf neu gebaut.
 */
import { getSettings } from '../services/settings'
import { createAnthropicProvider } from './anthropic'
import { createOllamaProvider } from './ollama'
import { createOpenAiProvider } from './openai'
import type { LlmProvider } from './types'

let cached: { key: string; provider: LlmProvider } | null = null

export function getLlm(): LlmProvider {
  const settings = getSettings()
  const key = `${settings.llm.provider}:${settings.llm.model}:${settings.llm.effort}:${settings.llm.baseUrl ?? ''}`
  if (cached?.key === key) return cached.provider

  const provider =
    settings.llm.provider === 'openai'
      ? createOpenAiProvider()
      : settings.llm.provider === 'ollama'
        ? createOllamaProvider()
        : createAnthropicProvider()

  cached = { key, provider }
  return provider
}

export function resetLlmCache(): void {
  cached = null
}

export * from './types'
