import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type LlmToolCall } from './types';

export interface AnthropicOptions {
  apiKey: string | null;
  model: string;
  baseUrl?: string | null;
  maxTokens?: number;
}

/** Sprachmodell-Anbieter Anthropic (Standard). */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  readonly label = 'Anthropic Claude';
  private client: Anthropic | null = null;

  constructor(private readonly options: AnthropicOptions) {}

  configured(): boolean {
    return Boolean(this.options.apiKey);
  }

  missingHint(): string {
    return 'ANTHROPIC_API_KEY hinterlegen (Einstellungen → Zugangsdaten oder .env).';
  }

  private get sdk(): Anthropic {
    if (!this.options.apiKey) throw new LlmError('Kein Anthropic-Schlüssel hinterlegt.', this.id);
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.options.apiKey,
        ...(this.options.baseUrl ? { baseURL: this.options.baseUrl } : {})
      });
    }
    return this.client;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const messages = toAnthropicMessages(request);
    try {
      const response = await this.sdk.messages.create({
        model: this.options.model,
        max_tokens: request.maxTokens ?? this.options.maxTokens ?? 4096,
        system: request.system,
        messages,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.tools && request.tools.length > 0
          ? {
              tools: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters as Anthropic.Tool.InputSchema
              }))
            }
          : {})
      });

      let text = '';
      const toolCalls: LlmToolCall[] = [];
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: (block.input ?? {}) as Record<string, unknown>
          });
        }
      }
      return {
        text: text.trim(),
        toolCalls,
        stopReason: response.stop_reason ?? 'end_turn',
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0
        }
      };
    } catch (error) {
      throw new LlmError(`Anthropic-Anfrage fehlgeschlagen: ${(error as Error).message}`, this.id, error);
    }
  }
}

/**
 * Übersetzt den anbieterneutralen Verlauf in das Anthropic-Format.
 * Werkzeugergebnisse werden dort als `tool_result`-Blöcke einer
 * Benutzernachricht erwartet und aufeinanderfolgend zusammengefasst.
 */
function toAnthropicMessages(request: LlmRequest): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const message of request.messages) {
    if (message.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = [];
      if (message.content) content.push({ type: 'text', text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
      }
      if (content.length > 0) result.push({ role: 'assistant', content });
      continue;
    }
    if (message.role === 'tool') {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? '',
        content: message.content
      };
      const last = result[result.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        (last.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        result.push({ role: 'user', content: [block] });
      }
      continue;
    }
    result.push({ role: 'user', content: [{ type: 'text', text: message.content }] });
  }
  return result;
}
