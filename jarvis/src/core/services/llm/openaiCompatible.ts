import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type LlmToolCall } from './types';

export interface OpenAiCompatibleOptions {
  apiKey: string | null;
  model: string;
  baseUrl: string;
  maxTokens?: number;
  /** Lokale Server (Ollama, LM Studio) brauchen keinen Schlüssel. */
  keyOptional?: boolean;
  label?: string;
}

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id: string; function: { name: string; arguments: string } }[];
    };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * Anbieter für alles, was die OpenAI-Chat-Completions-Schnittstelle spricht:
 * OpenAI selbst, Azure-Deployments, Groq, Ollama (`/v1`), LM Studio.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = 'openai-kompatibel';
  readonly label: string;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.label = options.label ?? 'OpenAI-kompatibel';
  }

  configured(): boolean {
    return Boolean(this.options.baseUrl) && (this.options.keyOptional === true || Boolean(this.options.apiKey));
  }

  missingHint(): string {
    return 'OPENAI_API_KEY und JARVIS_LLM_BASE_URL hinterlegen (z. B. https://api.openai.com/v1).';
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!this.configured()) throw new LlmError('Anbieter ist nicht vollständig eingerichtet.', this.id);
    const body = {
      model: this.options.model,
      max_tokens: request.maxTokens ?? this.options.maxTokens ?? 4096,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      messages: [
        { role: 'system', content: request.system },
        ...request.messages.map((message) => {
          if (message.role === 'tool') {
            return { role: 'tool', tool_call_id: message.toolCallId ?? '', content: message.content };
          }
          if (message.role === 'assistant' && message.toolCalls?.length) {
            return {
              role: 'assistant',
              content: message.content || null,
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.arguments) }
              }))
            };
          }
          return { role: message.role, content: message.content };
        })
      ],
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.parameters }
            }))
          }
        : {})
    };

    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {})
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new LlmError(`Verbindung zum Sprachmodell fehlgeschlagen: ${(error as Error).message}`, this.id, error);
    }

    const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
    if (!response.ok) {
      throw new LlmError(
        `Sprachmodell antwortete mit ${response.status}: ${data.error?.message ?? 'unbekannter Fehler'}`,
        this.id
      );
    }
    const choice = data.choices?.[0];
    const toolCalls: LlmToolCall[] = (choice?.message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: safeParse(call.function.arguments)
    }));
    return {
      text: (choice?.message?.content ?? '').trim(),
      toolCalls,
      stopReason: choice?.finish_reason ?? 'stop',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0
      }
    };
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
