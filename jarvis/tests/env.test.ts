/**
 * .env einlesen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnvFiles, parseEnvFile } from '../src/main/services/env'

describe('parseEnvFile', () => {
  it('liest Schlüssel und Werte, ignoriert Kommentare und Leerzeilen', () => {
    const parsed = parseEnvFile(`
# ein Kommentar
ANTHROPIC_API_KEY=sk-abc123

  OPENAI_API_KEY = "sk-def456"
export BRAVE_SEARCH_API_KEY='brv-1'
LEER=
kaputte zeile ohne gleichheitszeichen
1UNGUELTIG=x
`)

    expect(parsed).toEqual({
      ANTHROPIC_API_KEY: 'sk-abc123',
      OPENAI_API_KEY: 'sk-def456',
      BRAVE_SEARCH_API_KEY: 'brv-1'
    })
  })

  it('behandelt ein Gleichheitszeichen im Wert richtig', () => {
    expect(parseEnvFile('TOKEN=abc=def==')).toEqual({ TOKEN: 'abc=def==' })
  })
})

describe('loadEnvFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jarvis-env-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.JARVIS_TEST_NEU
    delete process.env.JARVIS_TEST_VORHANDEN
  })

  it('übernimmt Werte, überschreibt aber nichts bereits Gesetztes', () => {
    process.env.JARVIS_TEST_VORHANDEN = 'aus der Umgebung'
    writeFileSync(join(dir, '.env'), 'JARVIS_TEST_NEU=aus der Datei\nJARVIS_TEST_VORHANDEN=aus der Datei\n')

    const result = loadEnvFiles([dir])

    expect(result?.keys).toEqual(['JARVIS_TEST_NEU'])
    expect(process.env.JARVIS_TEST_NEU).toBe('aus der Datei')
    expect(process.env.JARVIS_TEST_VORHANDEN).toBe('aus der Umgebung')
  })

  it('gibt null zurück, wenn es keine Datei gibt', () => {
    expect(loadEnvFiles([dir])).toBeNull()
  })
})
