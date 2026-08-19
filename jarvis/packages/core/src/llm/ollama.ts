import {
  type ChatRequest,
  type ChatResponse,
  type FetchLike,
  type LlmProvider,
  type LlmToolCall,
  type ProviderOptions,
  requestJson,
} from './types.js';

export const OLLAMA_DEFAULT_MODEL = 'qwen2.5:14b';

interface OllamaResponse {
  model: string;
  message?: {
    content?: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> | string } }>;
  };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Lokales Modell ueber Ollama. Damit laeuft JARVIS ohne jede Cloud --
 * relevant, wenn Firmendaten den Rechner nicht verlassen sollen.
 * Werkzeugaufrufe koennen nur Modelle, die "tools" unterstuetzen.
 */
export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;
  readonly defaultModel: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: ProviderOptions) {
    this.defaultModel = options.model || OLLAMA_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? ((u, i) => fetch(u, i));
    this.timeoutMs = options.timeoutMs ?? 300_000;
  }

  isConfigured(): boolean {
    // Ollama braucht keinen Schluessel; ob der Dienst laeuft, zeigt erst der Aufruf.
    return Boolean(this.options.baseUrl);
  }

  missingConfigHint(): string | null {
    return null;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages: Array<Record<string, unknown>> = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    for (const m of request.messages) {
      if (m.role === 'user') messages.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
        const msg: Record<string, unknown> = { role: 'assistant', content: m.content };
        if (m.toolCalls?.length) {
          msg.tool_calls = m.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.arguments } }));
        }
        messages.push(msg);
      } else {
        messages.push({ role: 'tool', content: m.content });
      }
    }

    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages,
      stream: false,
      options: { temperature: request.temperature ?? 0.3, num_predict: request.maxTokens ?? 4096 },
    };
    if (request.tools?.length && request.toolChoice !== 'none') {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const json = (await requestJson(
      this.fetchImpl,
      `${this.options.baseUrl.replace(/\/$/, '')}/api/chat`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      this.timeoutMs,
      request.signal,
    )) as OllamaResponse;

    const toolCalls: LlmToolCall[] = (json.message?.tool_calls ?? []).map((tc, i) => ({
      id: `ollama_${i}_${tc.function.name}`,
      name: tc.function.name,
      arguments:
        typeof tc.function.arguments === 'string'
          ? (safeParse(tc.function.arguments) ?? {})
          : tc.function.arguments,
    }));

    return {
      text: (json.message?.content ?? '').trim(),
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use' : json.done_reason === 'length' ? 'length' : 'stop',
      model: json.model,
      usage: { inputTokens: json.prompt_eval_count, outputTokens: json.eval_count },
      raw: json,
    };
  }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
