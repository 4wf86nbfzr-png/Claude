/**
 * iCalendar lesen.
 *
 * Reicht für die Frage "was steht heute noch an": Termine aus lokalen
 * .ics-Dateien, wie sie Apple Kalender, Outlook, Thunderbird und die
 * Abo-Kalender von Google exportieren.
 *
 * Wiederholungen werden für einfache Regeln (täglich, wöchentlich,
 * monatlich, jährlich mit Intervall, COUNT und UNTIL) im abgefragten
 * Zeitraum aufgelöst. Alles Komplexere wird als wiederkehrend markiert und
 * nicht stillschweigend falsch berechnet.
 */

export interface CalendarEvent {
  uid: string
  summary: string
  start: string
  end: string | null
  allDay: boolean
  location: string | null
  description: string | null
  /** Bei Serienterminen: die Regel im Original. */
  recurrence: string | null
  /** true, wenn die Regel zu komplex war, um sie aufzulösen. */
  recurrenceUnresolved: boolean
  calendar: string
}

/** Fortsetzungszeilen zusammenführen (RFC 5545: Zeilen ab Spalte 1 mit Leerzeichen). */
export function unfold(text: string): string[] {
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1)
    } else {
      lines.push(raw)
    }
  }
  return lines
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/** Wandelt einen ICS-Zeitstempel in ein Date. */
export function parseIcsDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  const clean = value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(clean)
  if (dateOnly) {
    return {
      date: new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
      allDay: true
    }
  }

  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(clean)
  if (!full) return null

  const [, y, mo, d, h, mi, s, zulu] = full
  if (zulu) {
    return {
      date: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))),
      allDay: false
    }
  }

  // Ohne Z gilt die Ortszeit. TZID wird nicht umgerechnet — dafür bräuchte es
  // eine Zeitzonendatenbank; stattdessen wird die lokale Zeit angenommen, was
  // für Kalender desselben Rechners in aller Regel stimmt.
  void params
  return {
    date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    allDay: false
  }
}

interface RawEvent {
  uid: string
  summary: string
  start: Date | null
  end: Date | null
  allDay: boolean
  location: string | null
  description: string | null
  rrule: string | null
}

/** Zerlegt eine ICS-Datei in Termine (ohne Wiederholungen aufzulösen). */
export function parseIcs(text: string, calendarName: string): RawEvent[] {
  const events: RawEvent[] = []
  let current: RawEvent | null = null

  for (const line of unfold(text)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {
        uid: '',
        summary: '(ohne Titel)',
        start: null,
        end: null,
        allDay: false,
        location: null,
        description: null,
        rrule: null
      }
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      if (current?.start) events.push(current)
      current = null
      continue
    }
    if (!current) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue
    const left = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const [name, ...paramParts] = left.split(';')
    const params: Record<string, string> = {}
    for (const part of paramParts) {
      const [key, val] = part.split('=')
      if (key && val) params[key.toUpperCase()] = val
    }

    switch (name.toUpperCase()) {
      case 'UID':
        current.uid = value.trim()
        break
      case 'SUMMARY':
        current.summary = unescapeText(value).trim() || '(ohne Titel)'
        break
      case 'LOCATION':
        current.location = unescapeText(value).trim() || null
        break
      case 'DESCRIPTION':
        current.description = unescapeText(value).trim().slice(0, 1000) || null
        break
      case 'DTSTART': {
        const parsed = parseIcsDate(value, params)
        if (parsed) {
          current.start = parsed.date
          current.allDay = parsed.allDay || params.VALUE === 'DATE'
        }
        break
      }
      case 'DTEND': {
        const parsed = parseIcsDate(value, params)
        if (parsed) current.end = parsed.date
        break
      }
      case 'RRULE':
        current.rrule = value.trim()
        break
      default:
        break
    }
  }

  void calendarName
  return events
}

interface Rrule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count: number | null
  until: Date | null
  simple: boolean
}

export function parseRrule(rule: string): Rrule | null {
  const parts = Object.fromEntries(
    rule
      .split(';')
      .map((part) => part.split('='))
      .filter((pair) => pair.length === 2)
      .map(([key, value]) => [key.toUpperCase(), value])
  ) as Record<string, string>

  const freq = parts.FREQ as Rrule['freq'] | undefined
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null

  // BYDAY & Co. werden nicht aufgelöst — dann lieber ehrlich markieren.
  const simple = !parts.BYDAY && !parts.BYMONTHDAY && !parts.BYSETPOS && !parts.BYMONTH

  let until: Date | null = null
  if (parts.UNTIL) {
    const parsed = parseIcsDate(parts.UNTIL, {})
    until = parsed?.date ?? null
  }

  return {
    freq,
    interval: Number(parts.INTERVAL ?? '1') || 1,
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until,
    simple
  }
}

function addInterval(date: Date, rule: Rrule): Date {
  const next = new Date(date)
  switch (rule.freq) {
    case 'DAILY':
      next.setDate(next.getDate() + rule.interval)
      break
    case 'WEEKLY':
      next.setDate(next.getDate() + 7 * rule.interval)
      break
    case 'MONTHLY':
      next.setMonth(next.getMonth() + rule.interval)
      break
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + rule.interval)
      break
  }
  return next
}

/**
 * Löst Termine für einen Zeitraum auf.
 * Serientermine werden bis zu 400 Wiederholungen weit verfolgt.
 */
export function expandEvents(
  raw: RawEvent[],
  window: { from: Date; to: Date },
  calendarName: string
): CalendarEvent[] {
  const out: CalendarEvent[] = []

  const push = (event: RawEvent, start: Date, unresolved: boolean): void => {
    const duration = event.end && event.start ? event.end.getTime() - event.start.getTime() : null
    const end = duration !== null ? new Date(start.getTime() + duration) : null
    out.push({
      uid: event.uid || `${calendarName}-${start.toISOString()}`,
      summary: event.summary,
      start: start.toISOString(),
      end: end?.toISOString() ?? null,
      allDay: event.allDay,
      location: event.location,
      description: event.description,
      recurrence: event.rrule,
      recurrenceUnresolved: unresolved,
      calendar: calendarName
    })
  }

  for (const event of raw) {
    if (!event.start) continue

    if (!event.rrule) {
      if (event.start >= window.from && event.start <= window.to) push(event, event.start, false)
      continue
    }

    const rule = parseRrule(event.rrule)
    if (!rule) {
      if (event.start >= window.from && event.start <= window.to) push(event, event.start, true)
      continue
    }

    let occurrence = new Date(event.start)
    let counted = 0
    for (let guard = 0; guard < 400; guard++) {
      if (rule.count !== null && counted >= rule.count) break
      if (rule.until && occurrence > rule.until) break
      if (occurrence > window.to) break
      if (occurrence >= window.from) push(event, occurrence, !rule.simple)
      occurrence = addInterval(occurrence, rule)
      counted++
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start))
  return out
}
