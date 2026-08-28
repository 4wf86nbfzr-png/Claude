import type { CalendarEvent, CalendarEventDraft, Clock } from '@jarvis/domain';
import type { Logger } from '@jarvis/observability';
import { HttpClient } from '../http.js';
import { ConnectorError, type CalendarConnector } from '../types.js';
import { MS_ENDPOINTS, type MicrosoftOAuth } from './oauth.js';

/**
 * Kalender ueber Microsoft Graph.
 *
 * Zeiten werden immer als lokale Zeit plus getrennte Zeitzone uebergeben -
 * genau so, wie sie am Telefon gesprochen werden. Eine Umrechnung nach UTC im
 * Client waere eine zusaetzliche Fehlerquelle, gerade an den beiden Tagen im
 * Jahr, an denen die Sommerzeit umschaltet.
 *
 * STATUS: unverified, siehe `docs/api-annahmen.md`.
 */
export const GRAPH_CALENDAR_PATHS = {
  events: '/me/events',
  event: (id: string) => `/me/events/${encodeURIComponent(id)}`,
  calendarView: '/me/calendarView',
} as const;

interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

interface GraphEvent {
  id: string;
  subject?: string;
  start?: GraphDateTime;
  end?: GraphDateTime;
  location?: { displayName?: string };
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  attendees?: { emailAddress?: { address?: string; name?: string }; type?: string }[];
  isReminderOn?: boolean;
  reminderMinutesBeforeStart?: number;
  createdDateTime?: string;
}

export interface GraphCalendarDeps {
  readonly oauth: MicrosoftOAuth;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly account: string;
  readonly fetchImpl?: typeof fetch;
}

export class GraphCalendarConnector implements CalendarConnector {
  readonly name = 'microsoft-graph-calendar';
  readonly account: string;
  private readonly http: HttpClient;

  constructor(private readonly deps: GraphCalendarDeps) {
    this.account = deps.account;
    this.http = new HttpClient(MS_ENDPOINTS.graphBase, {
      logger: deps.logger,
      accessToken: (force) => deps.oauth.getAccessToken(force),
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    });
  }

  async listEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
    const url =
      `${GRAPH_CALENDAR_PATHS.calendarView}?startDateTime=${encodeURIComponent(fromIso)}` +
      `&endDateTime=${encodeURIComponent(toIso)}&$orderby=start/dateTime&$top=50`;
    const res = await this.http.get<{ value: GraphEvent[] }>(url, {
      headers: { Prefer: 'outlook.timezone="Europe/Berlin"' },
    });
    return res.data.value.map((e) => this.toDomain(e));
  }

  async createEvent(draft: CalendarEventDraft): Promise<CalendarEvent> {
    const res = await this.http.post<GraphEvent>(GRAPH_CALENDAR_PATHS.events, this.toGraph(draft), {
      maxRetries: 0,
      retryOnServerError: false,
    });
    if (res.data.id === undefined) {
      // Kein bestaetigter Termin - der Aufrufer darf hier nicht "eingetragen" sagen.
      throw new ConnectorError('Der Kalender hat keine Termin-ID zurueckgegeben', 'server', false);
    }
    return this.toDomain(res.data);
  }

  async updateEvent(providerEventId: string, draft: CalendarEventDraft): Promise<CalendarEvent> {
    const res = await this.http.patch<GraphEvent>(
      GRAPH_CALENDAR_PATHS.event(providerEventId),
      this.toGraph(draft),
      { maxRetries: 0, retryOnServerError: false },
    );
    return this.toDomain(res.data);
  }

  async cancelEvent(providerEventId: string): Promise<void> {
    await this.http.delete(GRAPH_CALENDAR_PATHS.event(providerEventId), {
      maxRetries: 0,
      retryOnServerError: false,
    });
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      if (!(await this.deps.oauth.isConnected())) {
        return { ok: false, message: 'Microsoft 365 ist noch nicht verbunden.' };
      }
      await this.http.get('/me/calendars?$top=1', { maxRetries: 1 });
      return { ok: true, message: `Kalender erreichbar (${this.account})` };
    } catch (err) {
      return {
        ok: false,
        message: `Kalender nicht erreichbar: ${err instanceof Error ? err.message : 'unbekannt'}`,
      };
    }
  }

  private toGraph(d: CalendarEventDraft): Record<string, unknown> {
    return {
      subject: d.title,
      start: { dateTime: `${d.start}:00`, timeZone: d.timeZone },
      end: { dateTime: `${d.end}:00`, timeZone: d.timeZone },
      ...(d.location === null ? {} : { location: { displayName: d.location } }),
      ...(d.description === null ? {} : { body: { contentType: 'Text', content: d.description } }),
      attendees: d.attendees.map((a) => ({
        emailAddress: { address: a.email, ...(a.name === null ? {} : { name: a.name }) },
        type: a.required ? 'required' : 'optional',
      })),
      isReminderOn: d.reminderMinutesBefore !== null,
      ...(d.reminderMinutesBefore === null
        ? {}
        : { reminderMinutesBeforeStart: d.reminderMinutesBefore }),
    };
  }

  private toDomain(e: GraphEvent): CalendarEvent {
    return {
      calendarId: 'primary',
      title: e.subject ?? '(ohne Titel)',
      start: trimSeconds(e.start?.dateTime ?? ''),
      end: trimSeconds(e.end?.dateTime ?? ''),
      timeZone: e.start?.timeZone ?? 'Europe/Berlin',
      location: e.location?.displayName ?? null,
      description: e.body?.content ?? e.bodyPreview ?? null,
      attendees: (e.attendees ?? []).map((a) => ({
        name: a.emailAddress?.name ?? null,
        email: a.emailAddress?.address ?? '',
        required: a.type !== 'optional',
      })),
      reminderMinutesBefore: e.isReminderOn === true ? (e.reminderMinutesBeforeStart ?? 15) : null,
      providerEventId: e.id,
      providerAccount: this.account,
      createdAt: e.createdDateTime ?? this.deps.clock.nowIso(),
    };
  }
}

/** Graph liefert `2026-05-07T14:00:00.0000000`; das Domainmodell will `2026-05-07T14:00`. */
function trimSeconds(dt: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(dt);
  return m?.[1] ?? dt;
}
