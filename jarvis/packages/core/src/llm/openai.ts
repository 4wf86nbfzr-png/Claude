import {
  type ChatRequest,
  type ChatResponse,
  type FetchLike,
  type LlmMessage,
  type LlmProvider,
  type LlmToolCall,
  type ProviderOptions,
  requestJson,
} from './types.js';

export const OPENAI_DEFAULT_MODEL = 'gpt-4o';

interface OpenAiResponse {
  model: string;
  choices: Array<{
    finish_reason: string | null;
    message: {
      content: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Deckt alle OpenAI-kompatiblen Endpunkte ab (OpenAI selbst, Azure-Gateways,
 * LM Studio, vLLM, OpenRouter ...) -- Basis-URL genuegt.
 */
export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai' as const;
  readonly defaultModel: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: ProviderOptions) {
    this.defaultModel = options.model || OPENAI_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? ((u, i) => fetch(u, i));
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  missingConfigHint(): string | null {
    return this.isConfigured() ? null : 'OPENAI_API_KEY fehlt (platform.openai.com → API Keys).';
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.options.apiKey) throw new Error('OPENAI_API_KEY ist nicht gesetzt.');

    const messages: Array<Record<string, unknown>> = [];
    if (request.system) messages.push({ role: 'system', content: request.system });
    messages.push(...toOpenAiMessages(request.messages));

    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages,
      max_tokens: request.maxTokens ?? 4096,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = request.toolChoice === 'none' ? 'none' : request.toolChoice === 'required' ? 'required' : 'auto';
    }

    const json = (await requestJson(
      this.fetchImpl,
      `${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify(body),
      },
      this.timeoutMs,
      request.signal,
    )) as OpenAiResponse;

    const choice = json.choices[0];
    const toolCalls: LlmToolCall[] = (choice?.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: parseArguments(tc.function.arguments),
    }));

    return {
      text: (choice?.message.content ?? '').trim(),
      toolCalls,
      stopReason:
        choice?.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice?.finish_reason === 'length'
            ? 'length'
            : choice?.finish_reason === 'stop'
              ? 'stop'
              : 'other',
      model: json.model,
      usage: { inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens },
      raw: json,
    };
  }
}

export function parseArguments(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { wert: v };
  } catch {
    return { __ungueltig: raw };
  }
}

export function toOpenAiMessages(messages: LlmMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'assistant') {
      const msg: Record<string, unknown> = { role: 'assistant', content: m.content || null };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }
      return msg;
    }
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  });
}
