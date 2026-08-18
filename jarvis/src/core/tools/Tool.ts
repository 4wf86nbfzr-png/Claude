import { z } from 'zod/v4';
import type { ApprovalAction, JarvisError, Result } from '../../shared/types.js';
import { err, makeError } from '../../shared/types.js';
import type { JsonSchema, LlmToolDefinition } from '../llm/types.js';
import type { ToolContext } from './context.js';

/**
 * A tool is the only way an agent can change anything in the world (§10).
 *
 * Every tool declares its parameters as a Zod schema — the same schema is
 * turned into the JSON Schema the model sees and used to validate what the
 * model actually sent, so a malformed call is rejected before it runs rather
 * than crashing inside the implementation.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  /** Owning agent, for the audit log and the transcript. */
  agent: string;
  description: string;
  schema: z.ZodType<TInput>;
  /**
   * Set when executing this tool is itself a gated action. The tool then never
   * performs the action directly; it creates an approval request and returns.
   */
  approvalAction?: ApprovalAction;
  /** Short German sentence describing the concrete call, used in the UI. */
  summarize(input: TInput): string;
  run(input: TInput, context: ToolContext): Promise<Result<TOutput, JarvisError>>;
}

export function defineTool<TInput, TOutput>(
  definition: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return definition;
}

function toJsonSchema(schema: z.ZodType<unknown>): JsonSchema {
  const generated = z.toJSONSchema(schema, { io: 'input', target: 'draft-7' }) as Record<string, unknown>;
  // The Messages API requires a top-level object schema.
  if (generated.type !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: false };
  }
  delete generated.$schema;
  return generated as unknown as JsonSchema;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<never, unknown>>();

  register(...definitions: Array<ToolDefinition<never, unknown>>): this {
    for (const definition of definitions) {
      if (this.tools.has(definition.name)) {
        throw new Error(`Werkzeug ${definition.name} ist bereits registriert.`);
      }
      this.tools.set(definition.name, definition);
    }
    return this;
  }

  get(name: string): ToolDefinition<never, unknown> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  all(): Array<ToolDefinition<never, unknown>> {
    return [...this.tools.values()];
  }

  /** The tool list handed to the model, in a stable order so prompts cache. */
  describe(only?: string[]): LlmToolDefinition[] {
    const wanted = only ? this.all().filter((tool) => only.includes(tool.name)) : this.all();
    return wanted
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: toJsonSchema(tool.schema as z.ZodType<unknown>),
      }));
  }

  /** Validates and executes. Unknown tools and bad parameters fail as values. */
  async execute(
    name: string,
    rawInput: unknown,
    context: ToolContext,
  ): Promise<Result<unknown, JarvisError>> {
    const tool = this.tools.get(name);
    if (!tool) {
      return err(
        makeError('tool.unknown', `Das Werkzeug „${name}" existiert nicht.`, {
          hint: `Verfügbar: ${this.names().join(', ')}`,
        }),
      );
    }
    const parsed = (tool.schema as z.ZodType<unknown>).safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      return err(
        makeError('tool.invalid_input', `Ungültige Parameter für ${name}.`, { detail: issues }),
      );
    }
    try {
      return await (tool as ToolDefinition<unknown, unknown>).run(parsed.data, context);
    } catch (error) {
      return err(
        makeError('tool.crashed', `Das Werkzeug ${name} ist unerwartet fehlgeschlagen.`, {
          detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        }),
      );
    }
  }

  summarize(name: string, rawInput: unknown): string {
    const tool = this.tools.get(name);
    if (!tool) return `Unbekanntes Werkzeug ${name}`;
    const parsed = (tool.schema as z.ZodType<unknown>).safeParse(rawInput ?? {});
    if (!parsed.success) return `${name} (ungültige Parameter)`;
    try {
      return (tool as ToolDefinition<unknown, unknown>).summarize(parsed.data);
    } catch {
      return name;
    }
  }
}
