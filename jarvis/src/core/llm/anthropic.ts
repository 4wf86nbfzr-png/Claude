import Anthropic from '@anthropic-ai/sdk';
import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { LlmContent, LlmProvider, LlmRequest, LlmResponse, LlmStopReason } from './types.js';

/**
 * Anthropic Messages API provider.
 *
 * A manual (streaming) tool loop lives one level up in `JarvisCore` rather than
 * using the SDK tool runner, because JARVIS needs the loop to pause for human
 * approval, write an audit entry per tool call and swap providers at runtime.
 * This class therefore performs exactly one turn and reports what came back.
 *
 * Notes on the request shape:
 *  - adaptive thinking is the current API; `budget_tokens` is rejected on Opus 5
 *  - `output_config.effort` controls depth; `high` is the default
 *  - server-side refusal fallbacks are enabled so a policy decline is rescued
 *    by a second model instead of returning nothing
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model = 'claude-opus-5',
    baseUrl?: string,
  ) {
    this.client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      maxRetries: 2,
    });
  }

  async complete(request: LlmRequest): Promise<Result<LlmResponse, JarvisError>> {
    try {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens,
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: toAnthropicMessages(request.messages),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
        thinking: { type: 'adaptive' },
        output_config: { effort: request.effort ?? 'high' },
        // A refused turn is rescued on a fallback model instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        ...(request.signal ? { signal: request.signal } : {}),
      });

      if (request.onTextDelta) {
        stream.on('text', request.onTextDelta);
      }

      const message = await stream.finalMessage();

      const content: LlmContent[] = [];
      for (const block of message.content) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          content.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
        // thinking blocks are intentionally not surfaced to the UI.
      }

      const stopReason = mapStopReason(message.stop_reason);
      const response: LlmResponse = {
        content,
        stopReason,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
        servedBy: message.model,
      };
      if (stopReason === 'refusal') {
        const details = message.stop_details;
        response.refusalNote =
          details && details.type === 'refusal'
            ? `Die Anfrage wurde vom Modell abgelehnt (${details.category ?? 'ohne Kategorie'}).`
            : 'Die Anfrage wurde vom Modell abgelehnt.';
      }
      return ok(response);
    } catch (error) {
      return err(translate(error));
    }
  }

  async ping(): Promise<Result<string, JarvisError>> {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Antworte nur mit: bereit' }],
      });
      const text = message.content.find((block) => block.type === 'text');
      return ok(`${this.model} erreichbar (${text && text.type === 'text' ? text.text.trim() : 'ok'})`);
    } catch (error) {
      return err(translate(error));
    }
  }
}

function mapStopReason(reason: string | null): LlmStopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

function toAnthropicMessages(messages: LlmRequest['messages']): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content.map((block) => {
      switch (block.type) {
        case 'text':
          return { type: 'text' as const, text: block.text };
        case 'tool_use':
          return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
        case 'tool_result':
          return {
            type: 'tool_result' as const,
            tool_use_id: block.toolUseId,
            content: block.content,
            ...(block.isError ? { is_error: true } : {}),
          };
      }
    }),
  }));
}

/** Turns SDK exceptions into the German, actionable errors the UI shows. */
function translate(error: unknown): JarvisError {
  if (error instanceof Anthropic.AuthenticationError) {
    return makeError('llm.auth', 'Der Anthropic-API-Schlüssel wurde abgelehnt.', {
      hint: 'Schlüssel in den Einstellungen unter „Zugänge" prüfen.',
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return makeError('llm.rate_limit', 'Das Anthropic-Kontingent ist momentan erschöpft.', {
      hint: 'In einigen Minuten erneut versuchen.',
      retryable: true,
    });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return makeError('llm.bad_request', 'Die Anfrage an das Modell war ungültig.', {
      detail: error.message.slice(0, 500),
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return makeError('llm.offline', 'Keine Verbindung zur Anthropic-API.', {
      hint: 'Internetverbindung und Proxy-Einstellungen prüfen.',
      retryable: true,
    });
  }
  if (error instanceof Anthropic.APIError) {
    return makeError('llm.api_error', `Die Anthropic-API meldete einen Fehler (${error.status}).`, {
      detail: error.message.slice(0, 500),
      retryable: (error.status ?? 500) >= 500,
    });
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return makeError('llm.aborted', 'Die Anfrage wurde abgebrochen.');
  }
  return makeError('llm.unknown', 'Unerwarteter Fehler bei der Modellanfrage.', {
    detail: error instanceof Error ? error.message : String(error),
  });
}
