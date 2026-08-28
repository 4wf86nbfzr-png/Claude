import { metrics, type Logger } from '@jarvis/observability';
import { buildSystemPrompt, type PromptContext } from './prompt.js';
import type { ToolContext, ToolRegistry } from './tools.js';

/**
 * Das Gehirn: Aeusserung rein, Antwortsatz raus.
 *
 * Bewusst hinter einem schmalen Interface. Damit laeuft der komplette
 * Gespraechsablauf einschliesslich Freigabe in Tests gegen ein
 * deterministisches Gehirn - ohne API-Schluessel, ohne Netzverbindung und
 * ohne dass ein Modelllauf die Aussage eines Sicherheitstests verwaessert.
 */
export interface BrainTurnInput {
  readonly utterance: string;
  readonly promptContext: PromptContext;
  readonly toolContext: ToolContext;
}

export interface BrainTurnResult {
  /** Was Jarvis sagt. Wird unveraendert vorgelesen. */
  readonly speech: string;
  /** Welche Werkzeuge in diesem Zug benutzt wurden - fuer Log und Diagnose. */
  readonly toolsUsed: readonly string[];
  readonly timeToFirstTokenMs: number | null;
}

export interface Brain {
  readonly name: string;
  turn(input: BrainTurnInput): Promise<BrainTurnResult>;
  reset(): void;
}

/* -------------------------------------------------------------------------- */
/* Deterministisches Gehirn                                                    */
/* -------------------------------------------------------------------------- */

export interface ScriptedStep {
  /** Trifft dieses Muster auf die Aeusserung zu, greift der Schritt. */
  readonly match: RegExp;
  /** Werkzeuge, die der Reihe nach aufgerufen werden. */
  readonly tools?: readonly { name: string; args: unknown | ((last: string | null) => unknown) }[];
  /** Antwortsatz. Als Funktion, wenn er vom letzten Werkzeugergebnis abhaengt. */
  readonly speak: string | ((results: readonly string[]) => string);
  /** Nur einmal ausfuehren. */
  readonly once?: boolean;
}

/**
 * Gehirn nach Drehbuch. Kein Modell, keine Zufaelligkeit - damit sich die
 * Sicherheitsaussagen der Tests auf die Architektur beziehen und nicht auf
 * das Wohlverhalten eines Modells.
 */
export class ScriptedBrain implements Brain {
  readonly name = 'scripted';
  readonly seenUtterances: string[] = [];
  private readonly used = new Set<ScriptedStep>();

  constructor(
    private readonly steps: readonly ScriptedStep[],
    private readonly registry: ToolRegistry,
    private readonly fallback = 'Das habe ich nicht verstanden. Sag es bitte noch einmal.',
  ) {}

  async turn(input: BrainTurnInput): Promise<BrainTurnResult> {
    this.seenUtterances.push(input.utterance);

    const step = this.steps.find(
      (s) => s.match.test(input.utterance) && !(s.once === true && this.used.has(s)),
    );
    if (step === undefined) {
      return { speech: this.fallback, toolsUsed: [], timeToFirstTokenMs: 0 };
    }
    this.used.add(step);

    const results: string[] = [];
    const toolsUsed: string[] = [];
    for (const call of step.tools ?? []) {
      const args = typeof call.args === 'function' ? call.args(results.at(-1) ?? null) : call.args;
      const r = await this.registry.invoke(call.name, args, input.toolContext);
      results.push(r.content);
      toolsUsed.push(call.name);
    }

    const speech = typeof step.speak === 'function' ? step.speak(results) : step.speak;
    return { speech, toolsUsed, timeToFirstTokenMs: 0 };
  }

  reset(): void {
    this.used.clear();
    this.seenUtterances.length = 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Claude Agent SDK                                                            */
/* -------------------------------------------------------------------------- */

export interface ClaudeBrainOptions {
  readonly model: string;
  readonly logger: Logger;
  readonly registry: ToolRegistry;
  readonly maxTurns?: number;
  /**
   * Einspringpunkt fuer das SDK. Wird als Abhaengigkeit uebergeben, damit
   * dieses Modul ohne installierte Laufzeit importierbar bleibt und der
   * Aufruf im Test ersetzt werden kann.
   */
  readonly runQuery: ClaudeQueryFn;
}

/**
 * Die Form, in der das Gehirn mit dem Modell spricht. Absichtlich schmal:
 * ein Systemprompt, ein Gespraechsverlauf, eine Werkzeugliste, und der
 * Aufrufer bekommt Werkzeugaufrufe zurueck, die er selbst ausfuehrt.
 *
 * Der Adapter auf `@anthropic-ai/claude-agent-sdk` steht in
 * `claude-agent-adapter.ts`.
 */
export type ClaudeQueryFn = (params: {
  systemPrompt: string;
  messages: readonly ClaudeMessage[];
  tools: readonly { name: string; description: string; inputSchema: unknown }[];
  model: string;
  signal?: AbortSignal;
}) => Promise<ClaudeReply>;

export interface ClaudeMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface ClaudeReply {
  readonly text: string;
  readonly toolCalls: readonly { name: string; args: unknown }[];
  readonly timeToFirstTokenMs: number | null;
}

/**
 * Gehirn auf Basis des Claude Agent SDK.
 *
 * Der Agentenlauf ist hier bewusst begrenzt: hoechstens `maxTurns`
 * Werkzeugrunden pro Gespraechszug. Am Telefon wartet ein Mensch - eine
 * Schleife, die zehn Werkzeuge nacheinander aufruft, ist dort schon
 * gescheitert, auch wenn sie am Ende richtig antwortet.
 *
 * STATUS: unverified. Ohne API-Schluessel laesst sich das hier nicht gegen das
 * echte Modell testen. Die Werkzeugausfuehrung und der Freigabeablauf sind
 * ueber `ScriptedBrain` vollstaendig getestet.
 */
export class ClaudeAgentBrain implements Brain {
  readonly name = 'claude-agent-sdk';
  private history: ClaudeMessage[] = [];

  constructor(private readonly opts: ClaudeBrainOptions) {}

  async turn(input: BrainTurnInput): Promise<BrainTurnResult> {
    const systemPrompt = buildSystemPrompt(input.promptContext);
    this.history.push({ role: 'user', content: input.utterance });

    const tools = this.opts.registry.names().map((name) => {
      const def = this.opts.registry.get(name);
      return {
        name,
        description: def?.description ?? '',
        inputSchema: def?.schema,
      };
    });

    const toolsUsed: string[] = [];
    let ttft: number | null = null;
    const maxTurns = this.opts.maxTurns ?? 4;

    for (let round = 0; round < maxTurns; round += 1) {
      const t0 = Date.now();
      const reply = await this.opts.runQuery({
        systemPrompt,
        messages: this.history,
        tools,
        model: this.opts.model,
      });
      if (ttft === null) {
        ttft = reply.timeToFirstTokenMs ?? Date.now() - t0;
        metrics.modelTtftMs.observe(ttft);
      }

      if (reply.toolCalls.length === 0) {
        this.history.push({ role: 'assistant', content: reply.text });
        return { speech: reply.text, toolsUsed, timeToFirstTokenMs: ttft };
      }

      const observations: string[] = [];
      for (const call of reply.toolCalls) {
        toolsUsed.push(call.name);
        const result = await this.opts.registry.invoke(call.name, call.args, input.toolContext);
        observations.push(`${call.name}: ${result.content}`);
      }
      this.history.push({ role: 'assistant', content: reply.text });
      this.history.push({ role: 'user', content: observations.join('\n\n') });
    }

    this.opts.logger.warn('werkzeugrunden_erschoepft', { maxTurns });
    return {
      speech: 'Da komme ich gerade nicht weiter. Sag mir bitte, was du konkret brauchst.',
      toolsUsed,
      timeToFirstTokenMs: ttft,
    };
  }

  reset(): void {
    this.history = [];
  }

  /** Kuerzt den Verlauf, damit ein langes Gespraech den Kontext nicht sprengt. */
  trimHistory(maxMessages = 40): void {
    if (this.history.length > maxMessages) {
      this.history = this.history.slice(-maxMessages);
    }
  }
}
