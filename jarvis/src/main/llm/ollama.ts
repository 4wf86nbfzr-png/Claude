/**
 * Ollama — lokales Modell, ohne dass Daten das Gerät verlassen.
 *
 * Der Funktionsaufruf hängt am Modell: nur Modelle mit Tool-Unterstützung
 * (z. B. llama3.1, qwen2.5, mistral-nemo) können die JARVIS-Werkzeuge
 * bedienen. Ohne Tools kann das Modell nur reden, nicht handeln.
 */
import { getSettings } from '../services/settings'
import type { LlmProvider, LlmRequest, LlmResponse } from './types'

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> }
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: OllamaToolCall[]
  tool_name?: string
}

function toOllamaMessages(request: LlmRequest): OllamaMessage[] {
  const out: OllamaMessage[] = [{ role: 'system', content: request.system }]

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
            ? { function: { name: b.name, arguments: (b.input ?? {}) as Record<string, unknown> } }
            : null
        )
        .filter((c): c is OllamaToolCall => c !== null)
      const entry: OllamaMessage = { role: 'assistant', content: text }
      if (calls.length > 0) entry.tool_calls = calls
      out.push(entry)
      continue
    }

    for (const block of message.content) {
      if (block.type === 'tool_result') {
        out.push({ role: 'tool', content: block.content })
      } else if (block.type === 'text') {
        out.push({ role: 'user', content: block.text })
      }
    }
  }

  return out
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const

  constructor(
    readonly model: string,
    private readonly baseUrl = 'http://127.0.0.1:11434'
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: toOllamaMessages(request),
        tools: request.tools.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
        }))
      }),
      signal: request.signal ?? null
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Ollama hat mit ${response.status} geantwortet: ${detail.slice(0, 300)}. ` +
          'Läuft "ollama serve" und ist das Modell geladen?'
      )
    }

    const data = (await response.json()) as {
      message?: { content?: string; tool_calls?: OllamaToolCall[] }
      done_reason?: string
    }

    const text = data.message?.content ?? ''
    if (text && request.onTextDelta) request.onTextDelta(text)

    const toolCalls = (data.message?.tool_calls ?? []).map((call, index) => ({
      id: `ollama-${index}-${call.function.name}`,
      name: call.function.name,
      input: call.function.arguments
    }))

    return {
      text,
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use' : (data.done_reason ?? 'end_turn'),
      raw: data.message
    }
  }
}

export function createOllamaProvider(): OllamaProvider {
  const settings = getSettings()
  return new OllamaProvider(settings.llm.model, settings.llm.baseUrl)
}
