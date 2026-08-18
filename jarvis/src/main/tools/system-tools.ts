/**
 * Werkzeuge für Dateien, Programme, Browser und Zwischenablage.
 *
 * Grundsatz aus der Anforderung: erst Schnittstellen, dann Kommandozeile,
 * und nur wenn es gar nicht anders geht, Maus- und Tastatursteuerung. Hier
 * wird ausschließlich der erste und zweite Weg genutzt — Programme werden
 * über die Betriebssystem-Oeffnungsmechanik gestartet, nie über simulierte
 * Klicks.
 *
 * Löschen und Ueberschreiben brauchen eine Freigabe.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { z } from 'zod'
import { requestApproval } from '../services/approval'
import { allowedRoots, checkPath, workspaceDir } from '../services/filesafety'
import { defineTool, fail, ok, type JarvisTool } from './types'
import type { ToolResult } from '@shared/types'

const FILE_AGENT = 'FileAgent'
const SYSTEM_AGENT = 'SystemAgent'
const BROWSER_AGENT = 'BrowserAgent'

// ---------------------------------------------------------------------------
// Betriebssystem-Hilfen
// ---------------------------------------------------------------------------

function electron(): {
  shell?: { openExternal(url: string): Promise<void>; openPath(path: string): Promise<string> }
  clipboard?: { readText(): string; writeText(text: string): void }
} | null {
  try {
    const require = createRequire(import.meta.url)
    return require('electron')
  } catch {
    return null
  }
}

/** Oeffnet Pfad oder URL mit dem Standardprogramm des Betriebssystems. */
async function openWithOs(target: string): Promise<{ ok: boolean; detail: string }> {
  const app = electron()
  if (app?.shell) {
    if (/^https?:\/\//i.test(target)) {
      await app.shell.openExternal(target)
      return { ok: true, detail: `${target} im Browser geöffnet.` }
    }
    const error = await app.shell.openPath(target)
    return error ? { ok: false, detail: error } : { ok: true, detail: `${target} geöffnet.` }
  }

  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target]
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', (err) => resolvePromise({ ok: false, detail: err.message }))
    child.unref()
    setTimeout(() => resolvePromise({ ok: true, detail: `${target} geöffnet.` }), 150)
  })
}

// ---------------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------------

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.yml', '.yaml', '.ics', '.log', '.eml'
])

const searchFilesTool = defineTool({
  name: 'search_files',
  agent: FILE_AGENT,
  readOnly: true,
  description:
    'Sucht Dateien in den freigegebenen Verzeichnissen nach Namensbestandteil. Gibt Pfad, Größe und Aenderungsdatum zurück.',
  schema: z.object({
    query: z.string().min(1).describe('Teil des Dateinamens.'),
    directory: z.string().optional().describe('Startverzeichnis; ohne Angabe der Arbeitsordner.'),
    limit: z.number().int().min(1).max(200).optional()
  }),
  async run(input) {
    const start = checkPath(input.directory ?? workspaceDir())
    if (!start.ok) return fail(start.error as string)

    const needle = input.query.toLowerCase()
    const limit = input.limit ?? 50
    const found: { path: string; sizeBytes: number; modifiedAt: string }[] = []

    const walk = (dir: string, depth: number): void => {
      if (found.length >= limit || depth > 6) return
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (found.length >= limit) return
        if (entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full, depth + 1)
        } else if (entry.name.toLowerCase().includes(needle)) {
          try {
            const stat = statSync(full)
            found.push({ path: full, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() })
          } catch {
            /* Datei war gerade weg — überspringen. */
          }
        }
      }
    }

    walk(start.path, 0)
    return ok(found, `${found.length} Treffer unter ${start.path}.`)
  }
})

const readFileTool = defineTool({
  name: 'read_file',
  agent: FILE_AGENT,
  readOnly: true,
  description: 'Liest eine Textdatei aus einem freigegebenen Verzeichnis.',
  schema: z.object({
    path: z.string(),
    max_chars: z.number().int().min(100).max(200_000).optional()
  }),
  async run(input) {
    const check = checkPath(input.path)
    if (!check.ok) return fail(check.error as string)
    if (!existsSync(check.path)) return fail(`${check.path} existiert nicht.`)

    const stat = statSync(check.path)
    if (!stat.isFile()) return fail(`${check.path} ist keine Datei.`)
    if (stat.size > 10_000_000) return fail(`${check.path} ist ${Math.round(stat.size / 1_000_000)} MB groß — zu viel zum Einlesen.`)

    const extension = extname(check.path).toLowerCase()
    if (extension && !TEXT_EXTENSIONS.has(extension)) {
      return fail(
        `${basename(check.path)} ist keine Textdatei (${extension}).`,
        'Zum Ansehen "open_path" verwenden — das öffnet die Datei im passenden Programm.'
      )
    }

    const content = readFileSync(check.path, 'utf8')
    const limit = input.max_chars ?? 40_000
    return ok(
      { path: check.path, content: content.slice(0, limit), truncated: content.length > limit, sizeBytes: stat.size },
      `${basename(check.path)} gelesen.`
    )
  }
})

const createFileTool = defineTool({
  name: 'create_file',
  agent: FILE_AGENT,
  readOnly: false,
  description:
    'Schreibt eine Textdatei in ein freigegebenes Verzeichnis. Existiert die Datei bereits, wird NICHT überschrieben, ' +
    'sondern eine Freigabe angefragt.',
  schema: z.object({
    path: z.string().describe('Zielpfad. Relative Pfade landen im Arbeitsordner.'),
    content: z.string(),
    overwrite: z.boolean().optional().describe('Nur setzen, wenn der Nutzer das Ueberschreiben verlangt hat.')
  }),
  async run(input, ctx) {
    const check = checkPath(input.path)
    if (!check.ok) return fail(check.error as string)

    const exists = existsSync(check.path)
    if (exists && !input.overwrite) {
      return fail(
        `${check.path} gibt es bereits.`,
        'Zum Ueberschreiben "overwrite" setzen — dann wird eine Freigabe angefragt.'
      )
    }

    if (exists) {
      const approval = requestApproval(
        {
          action: 'datei_ueberschreiben',
          title: `Datei überschreiben: ${basename(check.path)}`,
          details: {
            Pfad: check.path,
            'Bisherige Größe': `${statSync(check.path).size} Byte`,
            'Neue Größe': `${Buffer.byteLength(input.content, 'utf8')} Byte`
          },
          body: input.content.slice(0, 4000),
          requestedBy: ctx.actor
        },
        async (): Promise<ToolResult> => {
          writeFileSync(check.path, input.content, 'utf8')
          return { ok: true, data: { path: check.path }, note: `${check.path} überschrieben.` }
        }
      )
      return {
        ok: false,
        error: 'Die Datei existiert bereits — das Ueberschreiben braucht eine Freigabe.',
        needsApproval: true,
        approvalId: approval.id
      }
    }

    mkdirSync(dirname(check.path), { recursive: true })
    writeFileSync(check.path, input.content, 'utf8')
    return ok({ path: check.path, sizeBytes: Buffer.byteLength(input.content, 'utf8') }, `${check.path} angelegt.`)
  }
})

const deleteFileTool = defineTool({
  name: 'delete_file',
  agent: FILE_AGENT,
  readOnly: false,
  description: 'BEANTRAGT das Löschen einer Datei. Löscht nichts ohne Freigabe.',
  schema: z.object({ path: z.string() }),
  async run(input, ctx) {
    const check = checkPath(input.path)
    if (!check.ok) return fail(check.error as string)
    if (!existsSync(check.path)) return fail(`${check.path} existiert nicht.`)

    const stat = statSync(check.path)
    if (!stat.isFile()) return fail(`${check.path} ist keine Datei — Verzeichnisse werden nicht gelöscht.`)

    const approval = requestApproval(
      {
        action: 'datei_loeschen',
        title: `Datei löschen: ${basename(check.path)}`,
        details: {
          Pfad: check.path,
          Größe: `${stat.size} Byte`,
          Geändert: stat.mtime.toISOString()
        },
        requestedBy: ctx.actor
      },
      async (): Promise<ToolResult> => {
        unlinkSync(check.path)
        return { ok: true, data: { path: check.path }, note: `${check.path} gelöscht.` }
      }
    )

    return {
      ok: false,
      error: 'Löschen braucht eine Freigabe. Es wurde nichts gelöscht.',
      needsApproval: true,
      approvalId: approval.id
    }
  }
})

const listWorkspaceTool = defineTool({
  name: 'list_workspace',
  agent: FILE_AGENT,
  readOnly: true,
  description: 'Zeigt, welche Verzeichnisse freigegeben sind und was im Arbeitsordner liegt.',
  schema: z.object({}),
  async run() {
    const root = workspaceDir()
    let entries: string[] = []
    try {
      entries = readdirSync(root).slice(0, 200)
    } catch {
      entries = []
    }
    return ok(
      { workspace: root, allowedRoots: allowedRoots(), entries: entries.map((e) => relative(root, join(root, e))) },
      `Arbeitsordner: ${root} (${entries.length} Einträge).`
    )
  }
})

// ---------------------------------------------------------------------------
// Programme, Browser, Zwischenablage
// ---------------------------------------------------------------------------

const openPathTool = defineTool({
  name: 'open_path',
  agent: SYSTEM_AGENT,
  readOnly: false,
  description:
    'Oeffnet eine Datei oder einen Ordner mit dem dafür eingestellten Programm des Betriebssystems. ' +
    'Aendert nichts an der Datei.',
  schema: z.object({ path: z.string() }),
  async run(input) {
    const check = checkPath(input.path)
    if (!check.ok) return fail(check.error as string)
    if (!existsSync(check.path)) return fail(`${check.path} existiert nicht.`)
    const result = await openWithOs(check.path)
    return result.ok ? ok({ path: check.path }, result.detail) : fail(`Konnte ${check.path} nicht öffnen: ${result.detail}`)
  }
})

const openApplicationTool = defineTool({
  name: 'open_application',
  agent: SYSTEM_AGENT,
  readOnly: false,
  description:
    'Startet ein Programm über die Oeffnungsmechanik des Betriebssystems. Unter macOS der Programmname ' +
    '("Mail", "Kalender"), unter Windows der Programm- oder Protokollname, unter Linux der Befehl. ' +
    'Es wird nichts installiert und nichts konfiguriert.',
  schema: z.object({
    name: z.string().min(1).describe('Programmname bzw. Befehl.'),
    arguments: z.array(z.string()).optional().describe('Optionale Startargumente.')
  }),
  async run(input) {
    // Nur der Programmname, keine Shell — sonst wäre hier eine Befehlsinjektion möglich.
    if (/[;&|`$><\n]/.test(input.name)) {
      return fail('Der Programmname enthält Sonderzeichen, die hier nicht erlaubt sind.')
    }

    const args = input.arguments ?? []
    try {
      if (process.platform === 'darwin') {
        const child = spawn('open', ['-a', input.name, ...args], { detached: true, stdio: 'ignore' })
        child.unref()
      } else if (process.platform === 'win32') {
        const child = spawn('cmd', ['/c', 'start', '', input.name, ...args], { detached: true, stdio: 'ignore' })
        child.unref()
      } else {
        const child = spawn(input.name, args, { detached: true, stdio: 'ignore' })
        child.unref()
      }
      return ok({ application: input.name }, `${input.name} gestartet.`)
    } catch (err) {
      return fail(`${input.name} ließ sich nicht starten: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
})

const openBrowserTool = defineTool({
  name: 'open_website_in_browser',
  agent: BROWSER_AGENT,
  readOnly: false,
  description:
    'Oeffnet eine Adresse im Standardbrowser des Nutzers — zum Anschauen. ' +
    'Zum Auslesen von Inhalten stattdessen "open_website" verwenden.',
  schema: z.object({ url: z.string().url() }),
  async run(input) {
    const result = await openWithOs(input.url)
    return result.ok ? ok({ url: input.url }, result.detail) : fail(result.detail)
  }
})

const clipboardTool = defineTool({
  name: 'clipboard',
  agent: SYSTEM_AGENT,
  readOnly: false,
  description: 'Liest die Zwischenablage oder legt Text hinein.',
  schema: z.object({
    action: z.enum(['lesen', 'schreiben']),
    text: z.string().optional().describe('Nur bei "schreiben".')
  }),
  async run(input) {
    const app = electron()
    if (!app?.clipboard) return fail('Die Zwischenablage ist nur in der laufenden Anwendung erreichbar.')
    if (input.action === 'lesen') {
      const text = app.clipboard.readText()
      return ok({ text }, text ? `Zwischenablage: ${text.slice(0, 120)}` : 'Die Zwischenablage ist leer.')
    }
    if (!input.text) return fail('Zum Schreiben wird ein Text gebraucht.')
    app.clipboard.writeText(input.text)
    return ok({ written: input.text.length }, 'In die Zwischenablage gelegt.')
  }
})

export const systemTools: JarvisTool[] = [
  searchFilesTool,
  readFileTool,
  createFileTool,
  deleteFileTool,
  listWorkspaceTool,
  openPathTool,
  openApplicationTool,
  openBrowserTool,
  clipboardTool
] as JarvisTool[]
