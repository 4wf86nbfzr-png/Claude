import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LlmToolSpec } from '../llm/types.js';
import { err, fromException, type Result } from '../util/result.js';
import type { JarvisContext } from '../context.js';

/**
 * Ein Tool ist die einzige Moeglichkeit, etwas real zu tun.
 *
 * Das Modell bekommt Name, Beschreibung und JSON-Schema; die Eingabe wird vor
 * dem Aufruf mit zod geprueft. Ein Handler bekommt damit garantiert typsichere
 * Argumente und muss keine Plausibilitaetspruefung nachholen.
 */
export interface ToolDefinition<TInput = unknown> {
  name: string;
  /** Was tut das Tool -- in der Sprache, in der das Modell denken soll. */
  description: string;
  input: z.ZodType<TInput>;
  category: ToolCategory;
  /** Nur lesende Tools duerfen ohne Rueckfrage beliebig oft laufen. */
  readOnly: boolean;
  /**
   * Das Ergebnis wird als JSON an das Modell zurueckgegeben, deshalb ist der
   * Ausgabetyp bewusst offen. Die Eingabe dagegen ist streng typisiert --
   * dort entstehen die Fehler, die man frueh sehen will.
   */
  handler: (input: TInput, ctx: JarvisContext) => Promise<Result<unknown>>;
  /** Kurzfassung des Ergebnisses fuer Log und Statuszeile. */
  summarize?: (input: TInput, result: Result<unknown>) => string;
}

export type ToolCategory =
  | 'recherche'
  | 'mail'
  | 'crm'
  | 'kampagne'
  | 'freigabe'
  | 'datei'
  | 'system'
  | 'kalender'
  | 'gedaechtnis'
  | 'sprache';

export function defineTool<TInput>(def: ToolDefinition<TInput>): ToolDefinition<TInput> {
  return def;
}

/**
 * Ein Tool mit beliebigem Eingabetyp. In der Registry liegen Tools mit ganz
 * unterschiedlichen Schemata nebeneinander -- die Typsicherheit greift beim
 * Definieren (`defineTool`) und beim Pruefen der Eingabe, nicht in der Map.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDefinition<any>;

export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: Result<unknown>;
  durationMs: number;
}

/**
 * Registry: haelt alle Tools, erzeugt die Modell-Spezifikation und fuehrt
 * Aufrufe aus. Ausserhalb dieser Klasse ruft niemand einen Handler direkt auf.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" ist bereits registriert.`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: AnyTool[]): void {
    for (const t of tools) this.register(t);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()].sort();
  }

  byCategory(category: ToolCategory): string[] {
    return [...this.tools.values()].filter((t) => t.category === category).map((t) => t.name);
  }

  /** Spezifikation fuer das Modell -- optional auf eine Auswahl beschraenkt. */
  specs(names?: string[]): LlmToolSpec[] {
    const selected = names ? names.filter((n) => this.tools.has(n)) : this.names();
    return selected.map((n) => {
      const t = this.tools.get(n) as AnyTool;
      return {
        name: t.name,
        description: t.description,
        parameters: toJsonSchema(t.input),
      };
    });
  }

  /**
   * Fuehrt ein Tool aus. Wirft nie -- Fehler kommen als Err zurueck, damit
   * das Modell sie sieht und darauf reagieren kann.
   */
  async call(name: string, rawInput: unknown, ctx: JarvisContext): Promise<Result<unknown>> {
    const tool = this.tools.get(name);
    if (!tool) {
      return err('NOT_FOUND', `Es gibt kein Tool namens "${name}".`, {
        hint: `Verfügbar sind: ${this.names().join(', ')}`,
      });
    }

    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(Wurzel)'}: ${i.message}`).join('; ');
      return err('INVALID_INPUT', `Aufruf von "${name}" hat ungültige Argumente: ${issues}`, {
        detail: { erhalten: rawInput },
      });
    }

    try {
      return await tool.handler(parsed.data, ctx);
    } catch (e) {
      return fromException(e);
    }
  }

  summarize(name: string, input: unknown, result: Result<unknown>): string {
    const tool = this.tools.get(name);
    if (tool?.summarize) {
      try {
        return tool.summarize(input, result);
      } catch {
        /* faellt auf die Standardfassung zurueck */
      }
    }
    return result.ok ? `${name}: erfolgreich` : `${name}: ${result.error.message}`;
  }
}

/** zod -> JSON-Schema, in der Form, die die Modelle erwarten. */
export function toJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
  delete json.$schema;
  // Die Anbieter verlangen ein Objekt auf oberster Ebene.
  if (json.type !== 'object') {
    return { type: 'object', properties: { wert: json }, required: ['wert'] };
  }
  if (!json.properties) json.properties = {};
  return json;
}
