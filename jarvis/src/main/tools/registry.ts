/**
 * Werkzeugverzeichnis.
 *
 * Registrierung, Schema-Uebersetzung für das Sprachmodell und die Ausführung
 * inklusive Protokollierung. Fehler eines Werkzeugs werden zu einem sauberen
 * Ergebnis — sie dürfen die Schleife des Agenten nicht abbrechen, aber auch
 * nicht als Erfolg durchgehen.
 */
import { z } from 'zod'
import { auditError, auditInfo } from '../services/audit'
import type { LlmToolDefinition } from '../llm/types'
import type { ToolResult } from '@shared/types'
import type { JarvisTool, ToolContext } from './types'

const registry = new Map<string, JarvisTool>()

export function registerTool(tool: JarvisTool): void {
  if (registry.has(tool.name)) throw new Error(`Werkzeug "${tool.name}" ist doppelt registriert.`)
  registry.set(tool.name, tool)
}

export function registerTools(tools: JarvisTool[]): void {
  for (const tool of tools) registerTool(tool)
}

export function getTool(name: string): JarvisTool | undefined {
  return registry.get(name)
}

export function listTools(): JarvisTool[] {
  return [...registry.values()]
}

export function clearTools(): void {
  registry.clear()
}

/** Uebersetzt die zod-Schemata in JSON-Schema für das Sprachmodell. */
export function toolDefinitions(names?: string[]): LlmToolDefinition[] {
  const tools = names ? names.map((n) => registry.get(n)).filter((t): t is JarvisTool => Boolean(t)) : listTools()
  return tools.map((tool) => {
    const schema = z.toJSONSchema(tool.schema, { io: 'input' }) as Record<string, unknown>
    // $schema ist für die Anbieter Ballast und wird von manchen abgelehnt.
    delete schema.$schema
    if (!schema.type) schema.type = 'object'
    if (!schema.properties) schema.properties = {}
    return { name: tool.name, description: tool.description, inputSchema: schema }
  })
}

/** Kurzfassung eines Ergebnisses für Protokoll und Oberfläche. */
export function summarize(result: ToolResult): string {
  if (!result.ok) return `Fehler: ${result.error}`
  if (result.note) return result.note
  const data = result.data
  if (data === null || data === undefined) return 'erledigt'
  if (Array.isArray(data)) return `${data.length} Einträge`
  if (typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>)
    return keys.length > 0 ? `Felder: ${keys.slice(0, 6).join(', ')}` : 'erledigt'
  }
  return String(data).slice(0, 200)
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = registry.get(name)
  if (!tool) {
    return {
      ok: false,
      error: `Es gibt kein Werkzeug namens "${name}".`,
      hint: `Verfügbar sind: ${[...registry.keys()].join(', ')}`
    }
  }

  const parsed = tool.schema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(Wurzel)'}: ${issue.message}`)
      .join('; ')
    return { ok: false, error: `Die Eingaben für "${name}" passen nicht: ${issues}` }
  }

  try {
    const result = await tool.run(parsed.data, ctx)
    if (result.ok) {
      auditInfo(tool.agent, `Werkzeug ${name}`, summarize(result))
    } else {
      auditError(tool.agent, `Werkzeug ${name} fehlgeschlagen`, result.error)
    }
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    auditError(tool.agent, `Werkzeug ${name} abgestürzt`, message)
    return { ok: false, error: `Das Werkzeug "${name}" ist abgebrochen: ${message}` }
  }
}
