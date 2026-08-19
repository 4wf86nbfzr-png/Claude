/**
 * Anbieterunabhaengige Schnittstelle zum Sprachmodell.
 *
 * Alle Agenten sprechen nur mit diesem Interface. Ob dahinter Anthropic,
 * ein OpenAI-kompatibler Endpunkt oder ein lokales Ollama steht, aendert
 * am Agentencode nichts.
 */

export interface LlmToolSpec {
  name: string;
  description: string;
  /** JSON-Schema des Eingabeobjekts. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export interface ChatRequest {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolSpec[];
  /** 'auto' = Modell entscheidet, 'none' = nur Text, 'required' = muss ein Tool rufen. */
  toolChoice?: 'auto' | 'none' | 'required';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: 'stop' | 'tool_use' | 'length' | 'other';
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  raw?: unknown;
}

export interface LlmProvider {
  readonly id: 'anthropic' | 'openai' | 'ollama';
  readonly defaultModel: string;
  /** Ist der Anbieter benutzbar (Schluessel gesetzt / Dienst erreichbar)? */
  isConfigured(): boolean;
  /** Klartexthinweis, was noch fehlt. */
  missingConfigHint(): string | null;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

/** Transportfunktion -- in Tests durch eine Attrappe ersetzbar. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ProviderOptions {
  apiKey?: string | null;
  baseUrl: string;
  model?: string | undefined;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Zeitüberschreitung nach ${timeoutMs} ms`)), timeoutMs);
  const onAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    const bodyText = await res.text();
    if (!res.ok) {
      throw new LlmHttpError(res.status, bodyText, url);
    }
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error(`Antwort von ${url} war kein gültiges JSON: ${bodyText.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

export class LlmHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly url: string,
  ) {
    super(`${new URL(url).host} antwortete mit HTTP ${status}: ${body.slice(0, 400)}`);
    this.name = 'LlmHttpError';
  }
}
