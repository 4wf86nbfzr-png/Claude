/**
 * Anbieterneutrale Schnittstelle zum Sprachmodell.
 *
 * JARVIS soll nicht an einen Anbieter gekettet sein. Alles, was die Agenten
 * brauchen, steht hier; die Uebersetzung in das jeweilige Protokoll passiert
 * in den Anbieterdateien daneben.
 */
import type { LlmProviderId } from '@shared/types'

/** JSON-Schema eines Tools. Bewusst locker typisiert — das Schema kommt aus zod. */
export type JsonSchema = Record<string, unknown>

export interface LlmToolDefinition {
  name: string
  description: string
  inputSchema: JsonSchema
}

export type LlmContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: LlmContent[]
  /**
   * Die Blöcke, wie der Anbieter sie geliefert hat. Anthropic erwartet
   * Denk-Blöcke unverändert zurück; deshalb werden sie hier mitgeführt
   * statt neu zusammengebaut.
   */
  raw?: unknown
}

export interface LlmRequest {
  system: string
  messages: LlmMessage[]
  tools: LlmToolDefinition[]
  maxTokens: number
  /** Wird für jedes Textstück aufgerufen, sobald es ankommt. */
  onTextDelta?: (delta: string) => void
  signal?: AbortSignal
}

export interface LlmToolCall {
  id: string
  name: string
  input: unknown
}

export interface LlmResponse {
  text: string
  toolCalls: LlmToolCall[]
  stopReason: string
  raw: unknown
  usage?: { inputTokens: number; outputTokens: number }
}

export interface LlmProvider {
  readonly id: LlmProviderId
  readonly model: string
  complete(request: LlmRequest): Promise<LlmResponse>
}

export class LlmConfigError extends Error {
  constructor(
    message: string,
    readonly hint: string
  ) {
    super(message)
    this.name = 'LlmConfigError'
  }
}
