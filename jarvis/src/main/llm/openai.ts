/**
 * OpenAI-kompatible Anbindung (auch für Azure/Proxy per baseUrl).
 *
 * Bewusst ohne Streaming: die Chat-Completions-Antwort kommt am Stück, der
 * Text wird danach in einem Rutsch weitergereicht. Für JARVIS reicht das —
 * der Anthropic-Weg ist der gestreamte Standardfall.
 */
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import { LlmConfigError, type LlmProvider, type LlmRequest, type LlmResponse } from './types'

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
}

function toOpenAiMessages(request: LlmRequest): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: request.system }]

  for (const message of request.messages) {
    if (message.role === 'assistant') {
      const text = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
      const calls = message.content
        .filter((b) => b.type === 'tool_use')
        .map((b) =>
          b.type === 'tool_use'
            ? { id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }
            : null
        )
        .filter((c): c is OpenAiToolCall => c !== null)
      const entry: OpenAiMessage = { role: 'assistant', content: text || null }
      if (calls.length > 0) entry.tool_calls = calls
      out.push(entry)
      continue
    }

    // Nutzerseite: Tool-Ergebnisse werden zu eigenen "tool"-Nachrichten.
    const results = message.content.filter((b) => b.type === 'tool_result')
    const texts = message.content.filter((b) => b.type === 'text')
    for (const block of results) {
      if (block.type !== 'tool_result') continue
      out.push({ role: 'tool', tool_call_id: block.toolUseId, content: block.content })
    }
    if (texts.length > 0) {
      out.push({
        role: 'user',
        content: texts.map((b) => (b.type === 'text' ? b.text : '')).join('\n')
      })
    }
  }

  return out
}

export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai' as const

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openai.com/v1'
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const body = {
      model: this.model,
      max_completion_tokens: request.maxTokens,
      messages: toOpenAiMessages(request),
      tools: request.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
      }))
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: request.signal ?? null
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`OpenAI hat mit ${response.status} geantwortet: ${detail.slice(0, 500)}`)
    }

    const data = (await response.json()) as {
      choices: { message: { content: string | null; tool_calls?: OpenAiToolCall[] }; finish_reason: string }[]
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    const choice = data.choices[0]
    if (!choice) throw new Error('OpenAI hat keine Antwort geliefert.')

    const text = choice.message.content ?? ''
    if (text && request.onTextDelta) request.onTextDelta(text)

    const toolCalls = (choice.message.tool_calls ?? []).map((call) => {
      let input: unknown = {}
      try {
        input = JSON.parse(call.function.arguments || '{}')
      } catch {
        input = { _unparsed: call.function.arguments }
      }
      return { id: call.id, name: call.function.name, input }
    })

    return {
      text,
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason,
      raw: choice.message,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined
    }
  }
}

export function createOpenAiProvider(): OpenAiProvider {
  const settings = getSettings()
  const apiKey = getSecret('OPENAI_API_KEY')
  if (!apiKey) {
    throw new LlmConfigError(
      'Es ist kein OpenAI-Schlüssel hinterlegt.',
      'Einstellungen -> Zugänge -> OPENAI_API_KEY eintragen (platform.openai.com/api-keys).'
    )
  }
  return new OpenAiProvider(settings.llm.model, apiKey, settings.llm.baseUrl)
}
