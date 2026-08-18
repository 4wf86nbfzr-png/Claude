import { z } from 'zod';
import type { LlmToolDefinition } from '../services/llm';
import { payloadHash } from '../util/hash';
import { fail, type ToolContext, type ToolDefinition, type ToolResult } from './types';

/**
 * Werkzeugverzeichnis (§10).
 *
 * Zwei Aufgaben, die hier zusammenlaufen:
 *  1. Eingaben des Sprachmodells gegen ein Schema prüfen, bevor irgendetwas
 *     passiert. Ein Agent kann nichts ausführen, was das Schema nicht erlaubt.
 *  2. Die Freigabepflicht durchsetzen. Für freigabepflichtige Werkzeuge wird
 *     die Freigabe hier eingelöst – nicht im Werkzeug selbst. Wer ein neues
 *     kritisches Werkzeug ergänzt, bekommt die Prüfung automatisch mit.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) throw new Error(`Werkzeug "${tool.name}" ist bereits registriert.`);
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Werkzeugbeschreibungen für das Sprachmodell (JSON-Schema aus zod). */
  definitions(names?: string[]): LlmToolDefinition[] {
    return this.list()
      .filter((tool) => !names || names.includes(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.schema, { io: 'input' }) as Record<string, unknown>
      }));
  }

  /**
   * Führt ein Werkzeug aus. Reihenfolge: Existenz → Schema → Freigabe → Ausführung.
   * Jeder Schritt kann abbrechen; jedes Ergebnis landet im Protokoll.
   */
  async run(name: string, rawInput: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return fail(`Unbekanntes Werkzeug: ${name}`);

    const parsed = tool.schema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(Wurzel)'}: ${issue.message}`)
        .join('; ');
      context.audit.log('Werkzeugaufruf abgelehnt', {
        agent: tool.agent,
        target: name,
        status: 'FEHLER',
        detail: { grund: 'Schemaverletzung', details }
      });
      return fail(`Aufruf von ${name} war unvollständig: ${details}`);
    }
    const input = parsed.data as Record<string, unknown>;

    if (tool.criticalAction) {
      const approvalId = Number(input.approvalId);
      if (!Number.isInteger(approvalId) || approvalId <= 0) {
        return fail(
          `"${name}" ist freigabepflichtig. Bitte zuerst eine Freigabe anfordern und die erteilte Freigabe-Nummer übergeben.`
        );
      }
      const hash = tool.contentHash ? await tool.contentHash(input, context) : payloadHash(withoutApproval(input));
      const decision = context.approvals.consume(approvalId, { action: tool.criticalAction, contentHash: hash });
      if (!decision.ok) {
        context.audit.log('Ausführung ohne gültige Freigabe verhindert', {
          agent: tool.agent,
          target: name,
          status: 'ABGELEHNT',
          detail: { approvalId, grund: decision.reason }
        });
        return fail(decision.reason, { approvalId });
      }
    }

    context.bus.emit({ kind: 'tool', toolName: name, toolStatus: 'start' });
    const begonnen = Date.now();
    try {
      const result = await tool.execute(input, context);
      context.audit.log(result.ok ? `Werkzeug ${name}` : `Werkzeug ${name} fehlgeschlagen`, {
        agent: tool.agent,
        target: name,
        status: result.ok ? 'OK' : 'FEHLER',
        detail: { dauerMs: Date.now() - begonnen, zusammenfassung: result.summary }
      });
      context.bus.emit({ kind: 'tool', toolName: name, toolStatus: result.ok ? 'ok' : 'fehler', text: result.summary });
      return result;
    } catch (error) {
      const message = (error as Error).message || String(error);
      context.audit.log(`Werkzeug ${name} abgestürzt`, {
        agent: tool.agent,
        target: name,
        status: 'FEHLER',
        detail: { fehler: message }
      });
      context.bus.emit({ kind: 'tool', toolName: name, toolStatus: 'fehler', text: message });
      return fail(`${name} ist fehlgeschlagen: ${message}`);
    }
  }
}

const withoutApproval = (input: Record<string, unknown>): Record<string, unknown> => {
  const { approvalId: _ignored, ...rest } = input;
  return rest;
};
