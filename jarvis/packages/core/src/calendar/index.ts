import { readFile } from 'node:fs/promises';
import { err, fromException, ok, type Result } from '../util/result.js';
import { normalizeWhitespace, truncate } from '../util/text.js';
import type { SystemService } from '../system/index.js';

/**
 * Kalender in Version 1 ueber ICS.
 *
 * Bewusst so: fast jeder Kalender (Google, Microsoft 365, Apple, Nextcloud)
 * bietet eine ICS-Abonnement-Adresse oder eine exportierte Datei an. Damit
 * funktioniert die Terminabfrage plattformuebergreifend, ohne dass fuer
 * Version 1 drei OAuth-Anbindungen fertig sein muessen.
 *
 * Die Anbindung an die Google-Calendar-API bzw. Microsoft Graph passt in
 * dieselbe Schnittstelle -- dafuer ist `CalendarSource` da.
 */

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  quelle: string;
}

export interface CalendarSource {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  events(range: { from: Date; to: Date }): Promise<Result<CalendarEvent[]>>;
}

export class IcsCalendar implements CalendarSource {
  readonly id = 'ics';
  readonly label = 'ICS-Kalender';

  constructor(
    /** Dateipfad oder http(s)-Adresse eines ICS-Abonnements. */
    private readonly location: string | null,
    private readonly system: SystemService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.location);
  }

  async events(range: { from: Date; to: Date }): Promise<Result<CalendarEvent[]>> {
    if (!this.location) {
      return err('NOT_CONFIGURED', 'Es ist kein Kalender hinterlegt.', {
        hint: 'In den Einstellungen eine ICS-Adresse oder eine .ics-Datei angeben.',
      });
    }

    let raw: string;
    try {
      if (/^https?:\/\//i.test(this.location) || /^webcal:\/\//i.test(this.location)) {
        const url = this.location.replace(/^webcal:/i, 'https:');
        const res = await this.fetchImpl(url, { headers: { accept: 'text/calendar' } });
        if (!res.ok) return err('NETWORK_ERROR', `Kalender nicht abrufbar (HTTP ${res.status}).`);
        raw = await res.text();
      } else {
        const safe = this.system.resolveSafePath(this.location);
        if (!safe.ok) return safe;
        raw = await readFile(safe.data, 'utf8');
      }
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    }

    const alle = parseIcs(raw, this.location);
    const von = range.from.getTime();
    const bis = range.to.getTime();
    const gefiltert = alle
      .filter((e) => {
        const start = new Date(e.start).getTime();
        return Number.isFinite(start) && start >= von && start <= bis;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    return ok(gefiltert);
  }
}

/**
 * ICS-Auswertung fuer VEVENT.
 *
 * Behandelt gefaltete Zeilen (Fortsetzung mit Leerzeichen), escapte Zeichen
 * und die drei ueblichen Zeitformate. Wiederholungsregeln (RRULE) werden
 * nicht aufgeloest -- das steht als Grenze auch im README.
 */
export function parseIcs(content: string, quelle = 'ics'): CalendarEvent[] {
  const lines = unfold(content);
  const events: CalendarEvent[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const start = current.DTSTART;
        if (start) {
          const allDay = start.params.VALUE === 'DATE' || /^\d{8}$/.test(start.value);
          events.push({
            uid: current.UID?.value ?? `ics_${events.length}`,
            summary: unescapeIcs(current.SUMMARY?.value ?? '(ohne Titel)'),
            start: toIso(start.value) ?? start.value,
            end: current.DTEND ? (toIso(current.DTEND.value) ?? current.DTEND.value) : null,
            allDay,
            location: current.LOCATION ? unescapeIcs(current.LOCATION.value) : null,
            description: current.DESCRIPTION ? truncate(unescapeIcs(current.DESCRIPTION.value), 500) : null,
            quelle,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...paramParts] = left.split(';');
    if (!name) continue;

    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
    current[name.toUpperCase()] = { value, params };
  }

  return events;
}

function unfold(content: string): string[] {
  const out: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out.map((l) => l.trimEnd()).filter(Boolean);
}

function unescapeIcs(v: string): string {
  return normalizeWhitespace(
    v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'),
  );
}

/** ICS kennt 20260818, 20260818T091500 und 20260818T091500Z. */
export function toIso(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  if (z) return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  // Ohne Zeitzonenangabe: als lokale Zeit deuten.
  const local = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}
