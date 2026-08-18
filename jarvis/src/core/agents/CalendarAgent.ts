import { promises as fs } from 'node:fs';
import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { SettingsService } from '../services/SettingsService.js';
import type { TaskRepository } from '../db/repositories/misc.js';

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string | null;
  location: string | null;
  allDay: boolean;
  source: string;
}

export interface CalendarDeps {
  settings: SettingsService;
  tasks: TaskRepository;
}

/**
 * Read-only calendar over ICS feeds (§20 lists Google Calendar and Outlook as
 * later additions; ICS is the interoperable subset that works today with all
 * of them). Nothing is ever written back.
 */
export class CalendarAgent {
  readonly name = 'CalendarAgent';

  constructor(private readonly deps: CalendarDeps) {}

  async upcoming(days = 7): Promise<Result<CalendarEvent[], JarvisError>> {
    const sources = this.deps.settings.get().integrations.calendarIcsSources;
    if (!sources.length) {
      return err(
        makeError('calendar.not_configured', 'Es ist kein Kalender hinterlegt.', {
          hint: 'Einstellungen → Integrationen → ICS-Adresse oder Datei eintragen.',
        }),
      );
    }

    const now = Date.now();
    const until = now + days * 86400 * 1000;
    const events: CalendarEvent[] = [];
    const failures: string[] = [];

    for (const source of sources) {
      const text = await loadIcs(source);
      if (!text.ok) {
        failures.push(`${source}: ${text.error.message}`);
        continue;
      }
      for (const event of parseIcs(text.value, source)) {
        const start = Date.parse(event.start);
        if (Number.isNaN(start) || start < now - 86400 * 1000 || start > until) continue;
        events.push(event);
      }
    }

    if (events.length === 0 && failures.length === sources.length) {
      return err(
        makeError('calendar.unreadable', 'Keine der Kalenderquellen war lesbar.', {
          detail: failures.join(' | '),
        }),
      );
    }

    events.sort((a, b) => a.start.localeCompare(b.start));
    return ok(events);
  }

  openTasks(): Array<{ title: string; dueAt: string | null }> {
    return this.deps.tasks.open().map((task) => ({ title: task.title, dueAt: task.dueAt }));
  }
}

async function loadIcs(source: string): Promise<Result<string, JarvisError>> {
  const normalized = source.replace(/^webcal:/i, 'https:');
  if (/^https?:/i.test(normalized)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(normalized, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        return err(makeError('calendar.http', `HTTP ${response.status}`));
      }
      return ok((await response.text()).slice(0, 4_000_000));
    } catch (error) {
      return err(
        makeError('calendar.offline', 'Kalender nicht erreichbar.', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  try {
    return ok(await fs.readFile(normalized, 'utf8'));
  } catch (error) {
    return err(
      makeError('calendar.file', 'Kalenderdatei nicht lesbar.', {
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/**
 * Minimal but correct-enough ICS reader: unfolds continuation lines, reads
 * VEVENT blocks and converts DATE / DATE-TIME values (including TZID-tagged
 * local times, which are treated as local wall-clock time).
 */
export function parseIcs(text: string, source: string): CalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const events: CalendarEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of unfolded.split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.DTSTART) {
        const start = parseIcsDate(current.DTSTART);
        if (start) {
          events.push({
            summary: unescapeIcs(current.SUMMARY ?? '(ohne Titel)'),
            start: start.iso,
            end: current.DTEND ? (parseIcsDate(current.DTEND)?.iso ?? null) : null,
            location: current.LOCATION ? unescapeIcs(current.LOCATION) : null,
            allDay: start.allDay,
            source,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const rawName = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const name = rawName.split(';')[0]?.toUpperCase() ?? '';
    if (name) current[name] = value;
  }

  return events;
}

function parseIcsDate(value: string): { iso: string; allDay: boolean } | null {
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    return {
      iso: new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      ).toISOString(),
      allDay: true,
    };
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(trimmed);
  if (dateTime) {
    const [, y, m, d, hh, mm, ss, zulu] = dateTime;
    if (zulu) {
      return {
        iso: new Date(
          Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)),
        ).toISOString(),
        allDay: false,
      };
    }
    return {
      iso: new Date(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss),
      ).toISOString(),
      allDay: false,
    };
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : { iso: new Date(parsed).toISOString(), allDay: false };
}

function unescapeIcs(value: string): string {
  return value
    .replaceAll('\\n', '\n')
    .replaceAll('\\,', ',')
    .replaceAll('\\;', ';')
    .replaceAll('\\\\', '\\')
    .trim();
}
