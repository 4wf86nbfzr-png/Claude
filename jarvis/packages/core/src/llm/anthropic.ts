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

/** Standardmodell -- bewusst als Konstante, damit es an einer Stelle steht. */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-5';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly defaultModel: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: ProviderOptions) {
    this.defaultModel = options.model || ANTHROPIC_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? ((u, i) => fetch(u, i));
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  missingConfigHint(): string | null {
    return this.isConfigured() ? null : 'ANTHROPIC_API_KEY fehlt (console.anthropic.com → API Keys).';
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.options.apiKey) {
      throw new Error('ANTHROPIC_API_KEY ist nicht gesetzt.');
    }

    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      messages: toAnthropicMessages(request.messages),
    };
    if (request.system) body.system = request.system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
      if (request.toolChoice === 'required') body.tool_choice = { type: 'any' };
      else if (request.toolChoice === 'none') body.tool_choice = { type: 'none' };
      else body.tool_choice = { type: 'auto' };
    }

    const json = (await requestJson(
      this.fetchImpl,
      `${this.options.baseUrl.replace(/\/$/, '')}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      },
      this.timeoutMs,
      request.signal,
    )) as AnthropicResponse;

    const text = json.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    const toolCalls: LlmToolCall[] = json.content
      .filter((b) => b.type === 'tool_use' && b.id && b.name)
      .map((b) => ({ id: b.id as string, name: b.name as string, arguments: b.input ?? {} }));

    return {
      text,
      toolCalls,
      stopReason:
        json.stop_reason === 'tool_use'
          ? 'tool_use'
          : json.stop_reason === 'max_tokens'
            ? 'length'
            : json.stop_reason === 'end_turn' || json.stop_reason === 'stop_sequence'
              ? 'stop'
              : 'other',
      model: json.model,
      usage: { inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens },
      raw: json,
    };
  }
}

/**
 * Umbau in das Anthropic-Format. Tool-Ergebnisse gehoeren dort in eine
 * `user`-Nachricht mit `tool_result`-Bloecken, aufeinanderfolgende
 * Ergebnisse werden zusammengefasst.
 */
export function toAnthropicMessages(messages: LlmMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: [{ type: 'text', text: m.content }] });
      continue;
    }
    if (m.role === 'assistant') {
      const content: Array<Record<string, unknown>> = [];
      if (m.content.trim()) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      if (content.length === 0) content.push({ type: 'text', text: '(keine Ausgabe)' });
      out.push({ role: 'assistant', content });
      continue;
    }
    // Tool-Ergebnis
    const block = {
      type: 'tool_result',
      tool_use_id: m.toolCallId,
      content: m.content,
      ...(m.isError ? { is_error: true } : {}),
    };
    const last = out[out.length - 1];
    const lastContent = last?.content;
    if (
      last &&
      last.role === 'user' &&
      Array.isArray(lastContent) &&
      lastContent.every((b) => (b as { type: string }).type === 'tool_result')
    ) {
      (lastContent as Array<unknown>).push(block);
    } else {
      out.push({ role: 'user', content: [block] });
    }
  }

  return out;
}
