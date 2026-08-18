import type { JarvisContext } from '../context.js';
import type { ChatResponse, LlmMessage, LlmToolCall } from '../llm/types.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { truncate } from '../util/text.js';
import { withAgentName } from '../context.js';

export interface AgentDefinition {
  /** Technischer Name, taucht im Audit-Log auf. */
  name: string;
  /** Was der Agent macht -- fuer die Oberflaeche und fuer den Router. */
  role: string;
  /** Wann JarvisCore ihn beauftragen soll. */
  whenToUse: string;
  /** Werkzeuge, die dieser Agent benutzen darf. Weniger ist mehr. */
  tools: string[];
  systemPrompt: (ctx: JarvisContext) => string;
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentRunInput {
  task: string;
  /** Vorgeschichte aus dem Gespraech (nur beim Hauptagenten sinnvoll). */
  history?: LlmMessage[];
  conversationId?: string | null;
}

export interface AgentStep {
  tool: string;
  input: unknown;
  ok: boolean;
  summary: string;
  durationMs: number;
}

export interface AgentRunResult {
  agent: string;
  text: string;
  steps: AgentStep[];
  /** Nachrichten des Laufs -- der Aufrufer haengt sie an die Vorgeschichte an. */
  messages: LlmMessage[];
  abgebrochen: boolean;
  hinweis?: string;
}

/**
 * Die Agentenschleife.
 *
 * Denken -> Werkzeug -> Ergebnis -> Denken, bis der Agent Text ohne
 * Werkzeugaufruf liefert oder die Schrittgrenze erreicht ist. Ein Agent
 * kann nur die Werkzeuge sehen, die in seiner Definition stehen -- der
 * MailAgent kommt so gar nicht erst in Versuchung, Dateien zu loeschen.
 */
export class Agent {
  constructor(readonly definition: AgentDefinition) {}

  get name(): string {
    return this.definition.name;
  }

  async run(input: AgentRunInput, baseCtx: JarvisContext): Promise<Result<AgentRunResult>> {
    const ctx = withAgentName(baseCtx, this.definition.name);
    const maxSteps = this.definition.maxSteps ?? 12;
    const specs = ctx.registry.specs(this.definition.tools);

    const messages: LlmMessage[] = [...(input.history ?? []), { role: 'user', content: input.task }];
    const laufNachrichten: LlmMessage[] = [{ role: 'user', content: input.task }];
    const steps: AgentStep[] = [];

    for (let schritt = 0; schritt < maxSteps; schritt += 1) {
      if (ctx.signal?.aborted) {
        return ok({
          agent: this.name,
          text: 'Der Vorgang wurde abgebrochen.',
          steps,
          messages: laufNachrichten,
          abgebrochen: true,
        });
      }

      ctx.bus.emit('status', { state: 'THINKING', detail: this.definition.role });

      let response: ChatResponse;
      try {
        response = await ctx.llm.chat({
          system: this.definition.systemPrompt(ctx),
          messages,
          tools: specs,
          toolChoice: specs.length > 0 ? 'auto' : 'none',
          temperature: this.definition.temperature ?? 0.3,
          maxTokens: this.definition.maxTokens ?? 4096,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
      } catch (e) {
        const failure = fromException(e, 'PROVIDER_ERROR');
        ctx.audit.failure(this.name, 'agent.modellfehler', `Das Sprachmodell hat nicht geantwortet: ${failure.error.message}`, failure.error);
        return err(failure.error.code, `Das Sprachmodell hat nicht geantwortet: ${failure.error.message}`, {
          hint: ctx.llm.missingConfigHint() ?? 'API-Schlüssel und Netzverbindung prüfen.',
        });
      }

      const assistantMessage: LlmMessage = {
        role: 'assistant',
        content: response.text,
        ...(response.toolCalls.length ? { toolCalls: response.toolCalls } : {}),
      };
      messages.push(assistantMessage);
      laufNachrichten.push(assistantMessage);

      if (response.toolCalls.length === 0) {
        ctx.bus.emit('status', { state: 'IDLE' });
        return ok({
          agent: this.name,
          text: response.text.trim(),
          steps,
          messages: laufNachrichten,
          abgebrochen: false,
        });
      }

      ctx.bus.emit('status', { state: 'EXECUTING', detail: response.toolCalls.map((t) => t.name).join(', ') });

      for (const call of response.toolCalls) {
        const ergebnis = await this.executeTool(call, ctx);
        steps.push(ergebnis.step);
        messages.push(ergebnis.message);
        laufNachrichten.push(ergebnis.message);
      }
    }

    // Schrittgrenze erreicht: das ehrlich melden statt etwas zu behaupten.
    const hinweis = `Die Bearbeitung wurde nach ${maxSteps} Schritten abgebrochen, um eine Endlosschleife zu vermeiden.`;
    ctx.audit.log({
      actor: this.name,
      action: 'agent.schrittgrenze',
      summary: hinweis,
      outcome: 'abgebrochen',
    });
    return ok({
      agent: this.name,
      text: `${hinweis} Was bisher passiert ist, steht im Protokoll.`,
      steps,
      messages: laufNachrichten,
      abgebrochen: true,
      hinweis,
    });
  }

  private async executeTool(
    call: LlmToolCall,
    ctx: JarvisContext,
  ): Promise<{ step: AgentStep; message: LlmMessage }> {
    const start = Date.now();
    if (!this.definition.tools.includes(call.name)) {
      // Sollte das Modell ein fremdes Werkzeug nennen, wird es nicht ausgefuehrt.
      const dauer = Date.now() - start;
      const meldung = `Das Werkzeug "${call.name}" steht ${this.name} nicht zur Verfügung. Erlaubt sind: ${this.definition.tools.join(', ')}.`;
      return {
        step: { tool: call.name, input: call.arguments, ok: false, summary: meldung, durationMs: dauer },
        message: { role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify({ ok: false, error: { code: 'PERMISSION_DENIED', message: meldung } }), isError: true },
      };
    }

    const result = await ctx.registry.call(call.name, call.arguments, ctx);
    const durationMs = Date.now() - start;
    const summary = ctx.registry.summarize(call.name, call.arguments, result);

    ctx.bus.emit('tool', { name: call.name, ok: result.ok, summary, agent: this.name });
    ctx.audit.log({
      actor: this.name,
      action: `tool.${call.name}`,
      summary,
      outcome: result.ok ? 'ok' : 'fehler',
      detail: { eingabe: call.arguments, dauerMs: durationMs, ...(result.ok ? {} : { fehler: result.error }) },
    });

    return {
      step: { tool: call.name, input: call.arguments, ok: result.ok, summary, durationMs },
      message: {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: truncate(JSON.stringify(result), 20_000),
        ...(result.ok ? {} : { isError: true }),
      },
    };
  }
}
