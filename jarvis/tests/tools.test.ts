/**
 * Werkzeugverzeichnis: Schemata, Prüfung der Eingaben, Fehlerverhalten.
 *
 * Wichtig ist hier vor allem, dass ein Werkzeug nie unbemerkt scheitert —
 * ein Absturz wird zu einem sauberen Fehlerergebnis, nicht zu einem Erfolg.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { clearTools, executeTool, listTools, registerTool, toolDefinitions } from '../src/main/tools/registry'
import { registerAllTools } from '../src/main/tools'
import { defineTool } from '../src/main/tools/types'
import { setupTestEnvironment, teardownTestEnvironment } from './helpers'
import type { ToolContext } from '../src/main/tools/types'

const ctx: ToolContext = { actor: 'Test', conversationId: null, say: () => undefined }

beforeEach(() => {
  setupTestEnvironment()
  clearTools()
})
afterEach(() => teardownTestEnvironment())

describe('Verzeichnis', () => {
  it('übersetzt zod-Schemata in JSON-Schema ohne $schema', () => {
    registerTool(
      defineTool({
        name: 'beispiel',
        agent: 'Test',
        readOnly: true,
        description: 'Beispiel',
        schema: z.object({ pflicht: z.string(), optional: z.number().optional() }),
        async run() {
          return { ok: true, data: null }
        }
      })
    )

    const [definition] = toolDefinitions()
    expect(definition.name).toBe('beispiel')
    expect(definition.inputSchema.type).toBe('object')
    expect(definition.inputSchema.$schema).toBeUndefined()
    expect(definition.inputSchema.required).toEqual(['pflicht'])
  })

  it('lehnt doppelte Namen ab', () => {
    const tool = defineTool({
      name: 'doppelt',
      agent: 'Test',
      readOnly: true,
      description: 'x',
      schema: z.object({}),
      async run() {
        return { ok: true, data: null }
      }
    })
    registerTool(tool)
    expect(() => registerTool(tool)).toThrow(/doppelt/)
  })
})

describe('Ausführung', () => {
  it('meldet ein unbekanntes Werkzeug als Fehler', async () => {
    const result = await executeTool('gibt_es_nicht', {}, ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/kein Werkzeug/)
  })

  it('prüft die Eingaben und nennt das fehlende Feld', async () => {
    registerTool(
      defineTool({
        name: 'braucht_zahl',
        agent: 'Test',
        readOnly: true,
        description: 'x',
        schema: z.object({ zahl: z.number() }),
        async run() {
          return { ok: true, data: null }
        }
      })
    )

    const result = await executeTool('braucht_zahl', { zahl: 'keine Zahl' }, ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/zahl/)
  })

  it('fängt einen Absturz ab und meldet ihn als Fehler', async () => {
    registerTool(
      defineTool({
        name: 'stuerzt_ab',
        agent: 'Test',
        readOnly: true,
        description: 'x',
        schema: z.object({}),
        async run() {
          throw new Error('kaputt')
        }
      })
    )

    const result = await executeTool('stuerzt_ab', {}, ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/kaputt/)
  })
})

describe('Alle Werkzeuge', () => {
  it('lässt sich vollständig registrieren und beschreiben', () => {
    registerAllTools()
    const tools = listTools()
    expect(tools.length).toBeGreaterThan(20)

    const names = tools.map((tool) => tool.name)
    for (const expected of [
      'search_web',
      'open_website',
      'extract_company_information',
      'verify_email',
      'research_companies',
      'create_email_draft',
      'read_email_draft',
      'send_email',
      'list_send_center',
      'run_campaign',
      'check_calendar',
      'search_files',
      'create_file',
      'delete_file',
      'open_application',
      'remember'
    ]) {
      expect(names).toContain(expected)
    }

    // Jedes Schema muss sich übersetzen lassen, sonst scheitert der erste
    // Aufruf des Sprachmodells zur Laufzeit.
    const definitions = toolDefinitions()
    expect(definitions).toHaveLength(tools.length)
    for (const definition of definitions) {
      expect(definition.description.length).toBeGreaterThan(10)
      expect(definition.inputSchema.type).toBe('object')
    }
  })

  it('beschreibt send_email ausdrücklich als reine Freigabeanfrage', () => {
    registerAllTools()
    const sendEmail = toolDefinitions(['send_email'])[0]
    expect(sendEmail.description).toMatch(/versendet NICHTS/i)
    expect(sendEmail.description).toMatch(/Freigabe/i)
  })
})
