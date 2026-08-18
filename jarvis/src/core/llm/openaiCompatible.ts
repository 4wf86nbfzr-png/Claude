import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { LlmContent, LlmProvider, LlmRequest, LlmResponse, LlmStopReason } from './types.js';

interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

/**
 * Provider for any OpenAI-compatible `/chat/completions` endpoint.
 *
 * Covers the OpenAI API itself and local runtimes that mirror it — Ollama
 * exposes exactly this shape on `http://localhost:11434/v1`, which is how the
 * `ollama` setting is served. Raw `fetch` is correct here: these are not
 * Anthropic endpoints, so the Anthropic SDK does not apply.
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly name: string;

  constructor(
    private readonly apiKey: string | null,
    readonly model: string,
    private readonly baseUrl: string,
    label = 'openai',
  ) {
    this.name = label;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async complete(request: LlmRequest): Promise<Result<LlmResponse, JarvisError>> {
    const messages: ChatMessagePayload[] = [{ role: 'system', content: request.system }];

    for (const message of request.messages) {
      if (message.role === 'user') {
        const toolResults = message.content.filter((block) => block.type === 'tool_result');
        const texts = message.content.filter((block) => block.type === 'text');
        for (const block of toolResults) {
          if (block.type !== 'tool_result') continue;
          messages.push({ role: 'tool', tool_call_id: block.toolUseId, content: block.content });
        }
        if (texts.length) {
          messages.push({
            role: 'user',
            content: texts.map((block) => (block.type === 'text' ? block.text : '')).join('\n'),
          });
        }
        continue;
      }

      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n');
      const calls = message.content
        .filter((block) => block.type === 'tool_use')
        .map((block) =>
          block.type === 'tool_use'
            ? {
                id: block.id,
                type: 'function' as const,
                function: { name: block.name, arguments: JSON.stringify(block.input) },
              }
            : null,
        )
        .filter((call): call is ChatToolCall => call !== null);
      messages.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      });
    }

    const body = {
      model: this.model,
      max_tokens: request.maxTokens,
      messages,
      ...(request.tools.length
        ? {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
    };

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        ...(request.signal ? { signal: request.signal } : {}),
      });

      if (!response.ok) {
        return err(await httpError(response, this.name));
      }

      const json = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string | null; tool_calls?: ChatToolCall[] };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };

      const choice = json.choices?.[0];
      if (!choice?.message) {
        return err(
          makeError('llm.empty_response', `${this.name} lieferte keine verwertbare Antwort.`, {
            detail: JSON.stringify(json).slice(0, 400),
          }),
        );
      }

      const content: LlmContent[] = [];
      if (choice.message.content) {
        content.push({ type: 'text', text: choice.message.content });
        request.onTextDelta?.(choice.message.content);
      }
      for (const call of choice.message.tool_calls ?? []) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          return err(
            makeError(
              'llm.tool_arguments',
              `${this.name} lieferte unlesbare Werkzeug-Parameter für ${call.function.name}.`,
              { detail: call.function.arguments.slice(0, 300) },
            ),
          );
        }
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
      }

      return ok({
        content,
        stopReason: mapFinish(choice.finish_reason),
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
        },
        servedBy: json.model ?? this.model,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return err(makeError('llm.aborted', 'Die Anfrage wurde abgebrochen.'));
      }
      return err(
        makeError('llm.offline', `Keine Verbindung zu ${this.name} (${this.baseUrl}).`, {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }

  async ping(): Promise<Result<string, JarvisError>> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
        headers: this.headers(),
      });
      if (!response.ok) return err(await httpError(response, this.name));
      return ok(`${this.name} erreichbar (${this.baseUrl})`);
    } catch (error) {
      return err(
        makeError('llm.offline', `Keine Verbindung zu ${this.name} (${this.baseUrl}).`, {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }
}

function mapFinish(reason: string | undefined): LlmStopReason {
  switch (reason) {
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    case 'stop':
      return 'end_turn';
    default:
      return 'other';
  }
}

async function httpError(response: Response, provider: string): Promise<JarvisError> {
  const text = await response.text().catch(() => '');
  if (response.status === 401 || response.status === 403) {
    return makeError('llm.auth', `Der Zugang zu ${provider} wurde abgelehnt (${response.status}).`, {
      hint: 'API-Schlüssel in den Einstellungen prüfen.',
      detail: text.slice(0, 300),
    });
  }
  if (response.status === 429) {
    return makeError('llm.rate_limit', `${provider} meldet zu viele Anfragen.`, {
      retryable: true,
      detail: text.slice(0, 300),
    });
  }
  return makeError('llm.api_error', `${provider} meldete HTTP ${response.status}.`, {
    detail: text.slice(0, 300),
    retryable: response.status >= 500,
  });
}
