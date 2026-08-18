import type { JarvisError, Result } from '../../shared/types.js';

/** JSON Schema fragment describing a tool's parameters. */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export type LlmContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContent[];
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface LlmResponse {
  content: LlmContent[];
  stopReason: LlmStopReason;
  /** Populated on refusal so the UI can explain why nothing happened. */
  refusalNote?: string;
  usage?: { inputTokens: number; outputTokens: number };
  /** The model that actually served the turn, if the provider reports it. */
  servedBy?: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  signal?: AbortSignal;
  /** Called with incremental assistant text so the UI can stream it. */
  onTextDelta?: (delta: string) => void;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  /** Fails as a value; never throws for expected API conditions. */
  complete(request: LlmRequest): Promise<Result<LlmResponse, JarvisError>>;
  /** Cheap credential check used by the setup assistant. */
  ping(): Promise<Result<string, JarvisError>>;
}
