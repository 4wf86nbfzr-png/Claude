/**
 * Werkzeuge.
 *
 * Ein Agent behauptet nie, etwas getan zu haben — er ruft ein Werkzeug auf und
 * bekommt ein strukturiertes Ergebnis. Nur diese Ergebnisse darf er
 * weitererzählen.
 */
import type { z } from 'zod'
import type { ToolResult } from '@shared/types'

export interface ToolContext {
  /** Wer den Aufruf ausgelöst hat — landet so im Protokoll. */
  actor: string
  conversationId: number | null
  signal?: AbortSignal
  /** Zwischenmeldung an die Oberfläche ("Ich schaue mir gerade ... an"). */
  say(message: string): void
}

export interface JarvisTool<S extends z.ZodType = z.ZodType> {
  name: string
  /** Der Text, den das Modell liest. Präzise formulieren — er steuert das Verhalten. */
  description: string
  schema: S
  /** Welcher Agent das Werkzeug bereitstellt (nur für Protokoll und Anzeige). */
  agent: string
  /**
   * true = das Werkzeug darf lesen/vorbereiten, aber nichts nach außen tun.
   * Werkzeuge mit Außenwirkung fordern selbst eine Freigabe an.
   */
  readOnly: boolean
  run(input: z.infer<S>, ctx: ToolContext): Promise<ToolResult>
}

export function defineTool<S extends z.ZodType>(tool: JarvisTool<S>): JarvisTool<S> {
  return tool
}

export function ok<T>(data: T, note?: string): ToolResult<T> {
  return note ? { ok: true, data, note } : { ok: true, data }
}

export function fail(error: string, hint?: string): ToolResult<never> {
  return hint ? { ok: false, error, hint } : { ok: false, error }
}
