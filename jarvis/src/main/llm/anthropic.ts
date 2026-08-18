/**
 * Anthropic-Anbindung (Voreinstellung).
 *
 * Verwendet das offizielle SDK und den Streaming-Weg: Bei langen Antworten
 * läuft sonst die HTTP-Zeit ab, und die Oberfläche soll den Text sowieso
 * mitlaufen sehen.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import { LlmConfigError, type LlmProvider, type LlmRequest, type LlmResponse } from './types'

function toAnthropicMessages(request: LlmRequest): Anthropic.MessageParam[] {
  return request.messages.map((message) => {
    // Antworten des Modells werden unverändert zurückgereicht — sonst gehen
    // Denk-Blöcke verloren, die das Modell im selben Gespräch erwartet.
    if (message.role === 'assistant' && Array.isArray(message.raw)) {
      return { role: 'assistant', content: message.raw as Anthropic.ContentBlockParam[] }
    }

    const content: Anthropic.ContentBlockParam[] = message.content.map((block) => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text }
        case 'tool_use':
          return { type: 'tool_use', id: block.id, name: block.name, input: block.input as object }
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: block.toolUseId,
            content: block.content,
            is_error: block.isError ?? false
          }
      }
    })
    return { role: message.role, content }
  })
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const
  private client: Anthropic

  constructor(
    readonly model: string,
    private readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max',
    apiKey: string,
    baseURL?: string
  ) {
    this.client = new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey })
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: toAnthropicMessages(request),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema
        })),
        // Adaptives Denken: das Modell entscheidet selbst, wie tief es geht.
        thinking: { type: 'adaptive' },
        output_config: { effort: this.effort }
      },
      request.signal ? { signal: request.signal } : undefined
    )

    if (request.onTextDelta) {
      const onDelta = request.onTextDelta
      stream.on('text', (delta) => onDelta(delta))
    }

    const message = await stream.finalMessage()

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const toolCalls = message.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      .map((block) => ({ id: block.id, name: block.name, input: block.input }))

    return {
      text,
      toolCalls,
      stopReason: message.stop_reason ?? 'end_turn',
      raw: message.content,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens }
    }
  }
}

export function createAnthropicProvider(): AnthropicProvider {
  const settings = getSettings()
  const apiKey = getSecret('ANTHROPIC_API_KEY')
  if (!apiKey) {
    throw new LlmConfigError(
      'Es ist kein Anthropic-Schlüssel hinterlegt.',
      'Einstellungen -> Zugänge -> ANTHROPIC_API_KEY eintragen (console.anthropic.com/settings/keys).'
    )
  }
  return new AnthropicProvider(settings.llm.model, settings.llm.effort, apiKey, settings.llm.baseUrl)
}
