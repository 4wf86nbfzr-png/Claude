/**
 * Werkzeuge für Termine und Aufgaben.
 *
 * Der Kalender wird aus lokalen .ics-Dateien gelesen — den Pfad gibt der
 * Nutzer in den Einstellungen an (Exportdatei oder Abo-Ordner). Google
 * Calendar und Microsoft 365 lassen sich später an derselben Stelle
 * anschließen: die Werkzeugsignatur bleibt dieselbe, nur die Quelle wechselt.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { z } from 'zod'
import { expandEvents, parseIcs, type CalendarEvent } from '../calendar/ics'
import { createTask, listTasks, setTaskStatus } from '../db/repos/system'
import { checkPath } from '../services/filesafety'
import { getSettings } from '../services/settings'
import { dataChanged } from '../services/events'
import { defineTool, fail, ok, type JarvisTool } from './types'

const AGENT = 'CalendarAgent'

/** Sammelt alle konfigurierten .ics-Dateien ein. */
function calendarFiles(): { path: string; name: string }[] {
  const sources = getSettings().files.calendarSources
  const files: { path: string; name: string }[] = []

  for (const source of sources) {
    const check = checkPath(source)
    const path = check.ok ? check.path : source
    if (!existsSync(path)) continue

    try {
      const stat = statSync(path)
      if (stat.isDirectory()) {
        for (const entry of readdirSync(path)) {
          if (extname(entry).toLowerCase() === '.ics') {
            files.push({ path: join(path, entry), name: basename(entry, '.ics') })
          }
        }
      } else if (extname(path).toLowerCase() === '.ics') {
        files.push({ path, name: basename(path, '.ics') })
      }
    } catch {
      /* Nicht lesbar — wird unten als fehlende Quelle sichtbar. */
    }
  }

  return files
}

const checkCalendarTool = defineTool({
  name: 'check_calendar',
  agent: AGENT,
  readOnly: true,
  description:
    'Liest die Termine aus den eingerichteten Kalenderdateien für einen Zeitraum. ' +
    'Ohne Angabe: heute. Beantwortet Fragen wie "was steht heute noch an".',
  schema: z.object({
    from: z.string().optional().describe('Startdatum ISO (YYYY-MM-DD). Vorgabe: heute.'),
    to: z.string().optional().describe('Enddatum ISO. Vorgabe: Ende des Starttages.'),
    days: z.number().int().min(1).max(90).optional().describe('Alternative zu "to": Anzahl Tage ab "from".')
  }),
  async run(input) {
    const files = calendarFiles()
    if (files.length === 0) {
      return fail(
        'Es ist keine Kalenderquelle eingerichtet.',
        'Einstellungen -> Dateien -> Kalenderquellen: Pfad zu einer .ics-Datei oder einem Ordner mit .ics-Dateien eintragen.'
      )
    }

    const from = input.from ? new Date(`${input.from}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0))
    if (Number.isNaN(from.getTime())) return fail(`"${input.from}" ist kein gültiges Datum.`)

    let to: Date
    if (input.to) {
      to = new Date(`${input.to}T23:59:59`)
      if (Number.isNaN(to.getTime())) return fail(`"${input.to}" ist kein gültiges Datum.`)
    } else if (input.days) {
      to = new Date(from.getTime() + input.days * 86_400_000)
    } else {
      to = new Date(new Date(from).setHours(23, 59, 59, 999))
    }

    const events: CalendarEvent[] = []
    const problems: string[] = []

    for (const file of files) {
      try {
        const text = readFileSync(file.path, 'utf8')
        events.push(...expandEvents(parseIcs(text, file.name), { from, to }, file.name))
      } catch (err) {
        problems.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    events.sort((a, b) => a.start.localeCompare(b.start))

    return ok(
      {
        from: from.toISOString(),
        to: to.toISOString(),
        calendars: files.map((f) => f.name),
        events: events.map((e) => ({
          titel: e.summary,
          beginn: e.start,
          ende: e.end,
          ganztägig: e.allDay,
          ort: e.location,
          kalender: e.calendar,
          serie: e.recurrence ? (e.recurrenceUnresolved ? 'wiederkehrend (Regel nicht aufgelöst)' : 'wiederkehrend') : null
        })),
        problems
      },
      events.length === 0
        ? 'In dem Zeitraum steht nichts im Kalender.'
        : `${events.length} Termine zwischen ${from.toLocaleDateString('de-DE')} und ${to.toLocaleDateString('de-DE')}.`
    )
  }
})

const listTasksTool = defineTool({
  name: 'list_tasks',
  agent: AGENT,
  readOnly: true,
  description: 'Listet die in JARVIS gespeicherten Aufgaben.',
  schema: z.object({}),
  async run() {
    const tasks = listTasks()
    const open = tasks.filter((t) => t.status === 'offen' || t.status === 'läuft')
    return ok(tasks, `${open.length} offene von ${tasks.length} Aufgaben.`)
  }
})

const createTaskTool = defineTool({
  name: 'create_task',
  agent: AGENT,
  readOnly: false,
  description: 'Legt eine Aufgabe an, an die JARVIS später erinnern kann.',
  schema: z.object({
    title: z.string().min(2),
    detail: z.string().optional(),
    due_at: z.string().optional().describe('Fälligkeit als ISO-Zeitstempel.')
  }),
  async run(input) {
    const task = createTask({ title: input.title, detail: input.detail ?? null, dueAt: input.due_at ?? null })
    dataChanged('tasks')
    return ok(task, `Aufgabe "${task.title}" angelegt.`)
  }
})

const updateTaskTool = defineTool({
  name: 'set_task_status',
  agent: AGENT,
  readOnly: false,
  description: 'Setzt den Status einer Aufgabe.',
  schema: z.object({
    task_id: z.number().int(),
    status: z.enum(['offen', 'läuft', 'erledigt', 'abgebrochen'])
  }),
  async run(input) {
    setTaskStatus(input.task_id, input.status)
    dataChanged('tasks')
    return ok({ taskId: input.task_id, status: input.status }, `Aufgabe #${input.task_id}: ${input.status}.`)
  }
})

export const calendarTools: JarvisTool[] = [
  checkCalendarTool,
  listTasksTool,
  createTaskTool,
  updateTaskTool
] as JarvisTool[]
