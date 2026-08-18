/**
 * Werkzeuge für das Gedächtnis.
 *
 * Bewusst ausdrücklich: JARVIS speichert nicht alles mit, was gesagt wird.
 * Eine Notiz entsteht nur, wenn das Modell dieses Werkzeug ruft — und der
 * Nutzer kann jede Notiz in der Oberfläche sehen und löschen.
 */
import { z } from 'zod'
import { forgetFact, listMemory, rememberFact } from '../db/repos/system'
import { dataChanged } from '../services/events'
import { defineTool, fail, ok, type JarvisTool } from './types'

const AGENT = 'MemoryService'

const rememberTool = defineTool({
  name: 'remember',
  agent: AGENT,
  readOnly: false,
  description:
    'Merkt sich eine dauerhafte Angabe — Vorlieben des Nutzers, Firmennotizen, wiederkehrende Vorgaben. ' +
    'Nur verwenden, wenn die Angabe über das laufende Gespräch hinaus gelten soll.',
  schema: z.object({
    scope: z
      .enum(['user_preference', 'company_note', 'task', 'system'])
      .describe('Wozu die Notiz gehört.'),
    key: z.string().min(2).describe('Kurzer Schlüssel, z. B. "tonalitaet" oder "firma:42:hinweis".'),
    value: z.string().min(1),
    origin: z.string().optional().describe('Woher die Angabe stammt, z. B. "vom Nutzer gesagt".'),
    expires_at: z.string().optional().describe('ISO-Zeitstempel, ab dem die Notiz verfällt.')
  }),
  async run(input) {
    const fact = rememberFact({
      scope: input.scope,
      key: input.key,
      value: input.value,
      origin: input.origin ?? 'vom Nutzer gesagt',
      expiresAt: input.expires_at ?? null
    })
    dataChanged('memory')
    return ok(fact, `Gemerkt: ${input.key}.`)
  }
})

const recallTool = defineTool({
  name: 'recall',
  agent: AGENT,
  readOnly: true,
  description: 'Gibt gespeicherte Notizen zurück, wahlweise nur einen Bereich.',
  schema: z.object({
    scope: z.enum(['user_preference', 'company_note', 'task', 'system', 'conversation']).optional(),
    search: z.string().optional()
  }),
  async run(input) {
    let facts = listMemory(input.scope)
    if (input.search) {
      const needle = input.search.toLowerCase()
      facts = facts.filter((f) => f.key.toLowerCase().includes(needle) || f.value.toLowerCase().includes(needle))
    }
    return ok(
      facts.map((f) => ({ id: f.id, scope: f.scope, key: f.key, value: f.value, origin: f.origin })),
      `${facts.length} Notizen.`
    )
  }
})

const forgetTool = defineTool({
  name: 'forget',
  agent: AGENT,
  readOnly: false,
  description: 'Löscht eine gespeicherte Notiz.',
  schema: z.object({ memory_id: z.number().int() }),
  async run(input) {
    const removed = forgetFact(input.memory_id)
    dataChanged('memory')
    if (removed === 0) return fail(`Notiz ${input.memory_id} existiert nicht.`)
    return ok({ memoryId: input.memory_id }, 'Notiz gelöscht.')
  }
})

export const memoryTools: JarvisTool[] = [rememberTool, recallTool, forgetTool] as JarvisTool[]
