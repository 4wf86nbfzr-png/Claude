export interface LlmToolDefinition {
  name: string;
  description: string;
  /** JSON-Schema der Parameter. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** Nur bei role === 'assistant'. */
  toolCalls?: LlmToolCall[];
  /** Nur bei role === 'tool'. */
  toolCallId?: string;
  toolName?: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Ein Sprachmodell-Anbieter. Die Agenten kennen ausschließlich diese
 * Schnittstelle – der Wechsel zwischen Anthropic, einem OpenAI-kompatiblen
 * Dienst oder einem lokalen Modell ist damit reine Konfiguration.
 */
export interface LlmProvider {
  readonly id: string;
  readonly label: string;
  configured(): boolean;
  /** Klartext, was noch fehlt – wird in der Oberfläche angezeigt. */
  missingHint(): string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Fehler, der dem Benutzer wörtlich gezeigt werden darf (keine Geheimnisse). */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
