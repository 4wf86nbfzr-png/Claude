import { describe, expect, it, vi } from 'vitest';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { MemorySecretStore } from '@jarvis/security';
import { FakeClock } from '@jarvis/testkit';
import type { OutboundDraft, DraftId } from '@jarvis/domain';
import { HttpClient, redactUrl } from './http.js';
import { ConnectorError, classifyHttpError, retryDelayMs } from './types.js';
import { GraphMailConnector, htmlToText } from './microsoft/graph-mail.js';
import { GraphCalendarConnector } from './microsoft/graph-calendar.js';
import { MicrosoftOAuth } from './microsoft/oauth.js';
import {
  WhatsAppCloudConnector,
  WhatsAppWebhookSchema,
  normalizeWaId,
  parseWhatsAppWebhook,
} from './whatsapp/cloud-api.js';

const logger = new Logger({ writer: new MemoryLogWriter(), level: 'error' });

/** Nachgebautes fetch: liefert vorgegebene Antworten und schreibt Aufrufe mit. */
function fakeFetch(
  responses: { status: number; body?: unknown; headers?: Record<string, string> }[] | (() => never),
): { impl: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (typeof responses === 'function') responses();
    const list = responses as { status: number; body?: unknown; headers?: Record<string, string> }[];
    const r = list[Math.min(i, list.length - 1)];
    i += 1;
    if (r === undefined) throw new Error('keine Antwort vorbereitet');
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), {
      status: r.status,
      ...(r.headers === undefined ? {} : { headers: r.headers }),
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const noSleep = async (): Promise<void> => undefined;

describe('HTTP-Schicht', () => {
  it('wiederholt bei 429 und beachtet Retry-After', async () => {
    const { impl, calls } = fakeFetch([
      { status: 429, headers: { 'retry-after': '1' } },
      { status: 200, body: { ok: true } },
    ]);
    const waits: number[] = [];
    const http = new HttpClient('https://x.test', {
      logger,
      fetchImpl: impl,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    const res = await http.get<{ ok: boolean }>('/a');
    expect(res.data.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(waits[0]).toBe(1000);
  });

  it('wiederholt schreibende Aufrufe NICHT', async () => {
    const { impl, calls } = fakeFetch([{ status: 503 }, { status: 200, body: {} }]);
    const http = new HttpClient('https://x.test', { logger, fetchImpl: impl, sleep: noSleep });

    await expect(http.post('/senden', { a: 1 })).rejects.toBeInstanceOf(ConnectorError);
    expect(calls).toHaveLength(1);
  });

  it('erneuert das Token bei 401 genau einmal', async () => {
    const { impl, calls } = fakeFetch([{ status: 401 }, { status: 401 }]);
    const forced: boolean[] = [];
    const http = new HttpClient('https://x.test', {
      logger,
      fetchImpl: impl,
      sleep: noSleep,
      accessToken: async (force) => {
        forced.push(force);
        return force ? 'neu' : 'alt';
      },
    });

    await expect(http.get('/a')).rejects.toMatchObject({ kind: 'auth' });
    expect(forced).toEqual([false, true]);
    expect(calls).toHaveLength(2);
  });

  it('klassifiziert Statuscodes richtig', () => {
    expect(classifyHttpError(401, '').kind).toBe('auth');
    expect(classifyHttpError(404, '').kind).toBe('not_found');
    expect(classifyHttpError(429, '').retryable).toBe(true);
    expect(classifyHttpError(503, '').retryable).toBe(true);
    expect(classifyHttpError(400, '').retryable).toBe(false);
  });

  it('deckelt die Wartezeit', () => {
    expect(retryDelayMs(20, null)).toBeLessThanOrEqual(60_000);
    expect(retryDelayMs(1, '3600')).toBeLessThanOrEqual(120_000);
  });

  it('entfernt Tokens aus einer URL fuers Log', () => {
    expect(redactUrl('https://x.test/a?access_token=geheim&harmlos=1')).toContain('access_token=redigiert');
    expect(redactUrl('https://x.test/a?access_token=geheim&harmlos=1')).toContain('harmlos=1');
    expect(redactUrl('https://x.test/a?access_token=geheim')).not.toContain('geheim');
  });
});

describe('Microsoft Graph - Postfach', () => {
  const clock = new FakeClock();

  function makeConnector(
    responses: Parameters<typeof fakeFetch>[0],
    stored: string | null,
  ): { c: GraphMailConnector; saved: (string | null)[]; calls: { url: string; init: RequestInit }[] } {
    const { impl, calls } = fakeFetch(responses);
    const saved: (string | null)[] = [];
    const oauth = { getAccessToken: async () => 'token', isConnected: async () => true } as unknown as MicrosoftOAuth;
    const c = new GraphMailConnector({
      oauth,
      logger,
      clock,
      account: 'noah@hermserviceteam.com',
      loadDeltaLink: () => stored,
      saveDeltaLink: (l) => saved.push(l),
      fetchImpl: impl,
    });
    return { c, saved, calls };
  }

  const message = {
    id: 'AAMkAGI2THVSAAA=',
    subject: 'Sicherheitsdienst',
    bodyPreview: 'Wir brauchen vier Leute.',
    receivedDateTime: '2026-03-02T08:55:00Z',
    conversationId: 'conv-1',
    importance: 'high',
    isDraft: false,
    from: { emailAddress: { name: 'Sabine Kroeger', address: 'Kroeger@Elbe-Events.de' } },
  };

  it('setzt beim ersten Lauf nur den Ausgangsstand und meldet keine Nachrichten', async () => {
    const { c, saved } = makeConnector(
      [{ status: 200, body: { value: [message], '@odata.deltaLink': 'https://graph/delta1' } }],
      null,
    );
    const events = await c.fetchNew();

    // Entscheidend: der volle Posteingang loest keine Anrufwelle aus.
    expect(events).toHaveLength(0);
    expect(saved).toEqual(['https://graph/delta1']);
  });

  it('liefert danach neue Nachrichten', async () => {
    const { c, saved } = makeConnector(
      [{ status: 200, body: { value: [message], '@odata.deltaLink': 'https://graph/delta2' } }],
      'https://graph/delta1',
    );
    const events = await c.fetchNew();

    expect(events).toHaveLength(1);
    expect(events[0]?.senderAddress).toBe('kroeger@elbe-events.de');
    expect(events[0]?.urgency).toBe('high');
    expect(events[0]?.threadId).toBe('conv-1');
    expect(saved).toEqual(['https://graph/delta2']);
  });

  it('folgt nextLink verbatim ueber mehrere Seiten', async () => {
    const { c, calls } = makeConnector(
      [
        { status: 200, body: { value: [message], '@odata.nextLink': 'https://graph/page2' } },
        { status: 200, body: { value: [], '@odata.deltaLink': 'https://graph/delta3' } },
      ],
      'https://graph/delta1',
    );
    await c.fetchNew();

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe('https://graph/delta1');
    expect(calls[1]?.url).toBe('https://graph/page2');
  });

  it('markiert eigene Nachrichten als selbst erzeugt', async () => {
    const { c } = makeConnector(
      [
        {
          status: 200,
          body: {
            value: [{ ...message, from: { emailAddress: { address: 'noah@hermserviceteam.com' } } }],
            '@odata.deltaLink': 'https://graph/d',
          },
        },
      ],
      'https://graph/delta1',
    );
    const events = await c.fetchNew();
    expect(events[0]?.selfOriginated).toBe(true);
  });

  it('ignoriert Entwuerfe und geloeschte Eintraege', async () => {
    const { c } = makeConnector(
      [
        {
          status: 200,
          body: {
            value: [
              { ...message, id: 'a', isDraft: true },
              { ...message, id: 'b', '@removed': { reason: 'deleted' } },
            ],
            '@odata.deltaLink': 'https://graph/d',
          },
        },
      ],
      'https://graph/delta1',
    );
    expect(await c.fetchNew()).toHaveLength(0);
  });

  it('behaelt den alten Delta-Link, wenn kein neuer kommt', async () => {
    const { c, saved } = makeConnector(
      [{ status: 200, body: { value: [] } }],
      'https://graph/delta1',
    );
    await c.fetchNew();
    expect(saved).toEqual(['https://graph/delta1']);
  });

  it('meldet einen Netzwerkfehler beim Senden als unklar, nicht als Fehlschlag', async () => {
    const { impl } = fakeFetch(() => {
      throw new Error('Verbindung abgebrochen');
    });
    const oauth = { getAccessToken: async () => 't', isConnected: async () => true } as unknown as MicrosoftOAuth;
    const c = new GraphMailConnector({
      oauth,
      logger,
      clock,
      account: 'noah@hermserviceteam.com',
      loadDeltaLink: () => null,
      saveDeltaLink: () => undefined,
      fetchImpl: impl,
    });

    const result = await c.send(draftFixture(), 'key-1');
    expect(result.status).toBe('unknown');
    expect(result.providerMessageId).toBeNull();
  });

  it('meldet eine abgelehnte Nachricht als Fehlschlag', async () => {
    const { impl } = fakeFetch([{ status: 400, body: { error: { message: 'ungueltig' } } }]);
    const oauth = { getAccessToken: async () => 't', isConnected: async () => true } as unknown as MicrosoftOAuth;
    const c = new GraphMailConnector({
      oauth,
      logger,
      clock,
      account: 'a@b.de',
      loadDeltaLink: () => null,
      saveDeltaLink: () => undefined,
      fetchImpl: impl,
    });

    const result = await c.send(draftFixture(), 'key-1');
    expect(result.status).toBe('failed');
  });

  it('sendet genau einen POST, ohne Wiederholung', async () => {
    const { impl, calls } = fakeFetch([{ status: 202 }]);
    const oauth = { getAccessToken: async () => 't', isConnected: async () => true } as unknown as MicrosoftOAuth;
    const c = new GraphMailConnector({
      oauth,
      logger,
      clock,
      account: 'a@b.de',
      loadDeltaLink: () => null,
      saveDeltaLink: () => undefined,
      fetchImpl: impl,
    });

    const result = await c.send(draftFixture(), 'key-1');
    expect(result.status).toBe('sent');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/me/sendMail');
  });
});

describe('HTML zu Text', () => {
  it('macht aus HTML-Mail vorlesbaren Text', () => {
    const html =
      '<html><style>p{color:red}</style><body><p>Moin Herr Benkhofer,</p>' +
      '<p>wir br&auml;uchten vier Leute.</p><script>alert(1)</script></body></html>';
    const text = htmlToText(html);

    expect(text).toContain('Moin Herr Benkhofer');
    expect(text).toContain('bräuchten');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });
});

describe('Microsoft Graph - Kalender', () => {
  it('uebergibt lokale Zeit plus Zeitzone statt UTC', async () => {
    const { impl, calls } = fakeFetch([
      {
        status: 201,
        body: {
          id: 'evt-1',
          subject: 'Besprechung',
          start: { dateTime: '2026-05-07T14:00:00.0000000', timeZone: 'Europe/Berlin' },
          end: { dateTime: '2026-05-07T15:00:00.0000000', timeZone: 'Europe/Berlin' },
        },
      },
    ]);
    const oauth = { getAccessToken: async () => 't', isConnected: async () => true } as unknown as MicrosoftOAuth;
    const c = new GraphCalendarConnector({
      oauth,
      logger,
      clock: new FakeClock(),
      account: 'a@b.de',
      fetchImpl: impl,
    });

    const created = await c.createEvent({
      calendarId: 'primary',
      title: 'Besprechung',
      start: '2026-05-07T14:00',
      end: '2026-05-07T15:00',
      timeZone: 'Europe/Berlin',
      location: null,
      description: null,
      attendees: [],
      reminderMinutesBefore: 15,
    });

    const sent = JSON.parse(String(calls[0]?.init.body)) as {
      start: { dateTime: string; timeZone: string };
    };
    expect(sent.start.timeZone).toBe('Europe/Berlin');
    expect(sent.start.dateTime).toBe('2026-05-07T14:00:00');
    expect(created.providerEventId).toBe('evt-1');
    expect(created.start).toBe('2026-05-07T14:00');
  });

  it('wirft, wenn keine Termin-ID zurueckkommt - kein falsches "eingetragen"', async () => {
    const { impl } = fakeFetch([{ status: 201, body: { subject: 'ohne id' } }]);
    const oauth = { getAccessToken: async () => 't', isConnected: async () => true } as unknown as MicrosoftOAuth;
    const c = new GraphCalendarConnector({
      oauth,
      logger,
      clock: new FakeClock(),
      account: 'a@b.de',
      fetchImpl: impl,
    });

    await expect(
      c.createEvent({
        calendarId: 'primary',
        title: 'X',
        start: '2026-05-07T14:00',
        end: '2026-05-07T15:00',
        timeZone: 'Europe/Berlin',
        location: null,
        description: null,
        attendees: [],
        reminderMinutesBefore: null,
      }),
    ).rejects.toBeInstanceOf(ConnectorError);
  });
});

describe('WhatsApp Cloud API', () => {
  const clock = new FakeClock('2026-03-02T12:00:00.000Z');

  function makeConnector(
    responses: Parameters<typeof fakeFetch>[0],
    lastInbound: string | null,
  ): { c: WhatsAppCloudConnector; calls: { url: string; init: RequestInit }[] } {
    const { impl, calls } = fakeFetch(responses);
    const secrets = new MemorySecretStore();
    void secrets.set('whatsapp-access-token', 'EAAG-token');
    const c = new WhatsAppCloudConnector({
      config: {
        phoneNumberId: '111222333',
        wabaId: '999',
        graphVersion: 'v23.0',
        serviceWindowHours: 24,
      },
      secrets,
      logger,
      clock,
      fetchImpl: impl,
      lastInboundAt: () => lastInbound,
    });
    return { c, calls };
  }

  it('sendet innerhalb des Antwortfensters', async () => {
    const { c, calls } = makeConnector(
      [{ status: 200, body: { messages: [{ id: 'wamid.ABC' }] } }],
      '2026-03-02T10:00:00.000Z',
    );
    const result = await c.send(draftFixture({ channel: 'whatsapp', recipient: '+49 151 777 66 66' }), 'k1');

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('wamid.ABC');
    const body = JSON.parse(String(calls[0]?.init.body)) as { to: string; messaging_product: string };
    expect(body.to).toBe('4915177766 66'.replace(/\D/g, ''));
    expect(body.messaging_product).toBe('whatsapp');
  });

  it('sendet ausserhalb des Antwortfensters gar nicht erst', async () => {
    const { c, calls } = makeConnector([{ status: 200 }], '2026-02-28T10:00:00.000Z');
    const result = await c.send(draftFixture({ channel: 'whatsapp' }), 'k1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Antwortfenster');
    expect(calls).toHaveLength(0);
  });

  it('sendet ohne vorherige eingehende Nachricht nicht', async () => {
    const { c, calls } = makeConnector([{ status: 200 }], null);
    const result = await c.send(draftFixture({ channel: 'whatsapp' }), 'k1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Vorlage');
    expect(calls).toHaveLength(0);
  });

  it('wertet eine Antwort ohne Nachrichten-ID nicht als Erfolg', async () => {
    const { c } = makeConnector([{ status: 200, body: { messaging_product: 'whatsapp' } }], '2026-03-02T11:00:00.000Z');
    const result = await c.send(draftFixture({ channel: 'whatsapp' }), 'k1');
    expect(result.status).toBe('unknown');
  });

  it('normalisiert Rufnummern fuer Meta', () => {
    expect(normalizeWaId('+49 151 77776666')).toBe('4915177776666');
    expect(normalizeWaId('4915177776666')).toBe('4915177776666');
  });
});

describe('WhatsApp Webhook', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '999',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp' as const,
              metadata: { display_phone_number: '4915199998888', phone_number_id: '111222333' },
              contacts: [{ profile: { name: 'Tarek' }, wa_id: '4915177776666' }],
              messages: [
                {
                  id: 'wamid.HBgN1',
                  from: '4915177776666',
                  timestamp: '1772449080',
                  type: 'text',
                  text: { body: 'Moin, brauche zwei Leute.' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('akzeptiert eine gueltige Nutzlast', () => {
    expect(WhatsAppWebhookSchema.safeParse(payload).success).toBe(true);
  });

  it('lehnt eine kaputte Nutzlast ab', () => {
    expect(WhatsAppWebhookSchema.safeParse({ object: 'x' }).success).toBe(false);
    expect(
      WhatsAppWebhookSchema.safeParse({
        ...payload,
        entry: [{ id: '1', changes: [{ field: 'messages', value: { messaging_product: 'telegram' } }] }],
      }).success,
    ).toBe(false);
  });

  it('macht aus einer Textnachricht ein Ereignis', () => {
    const parsed = parseWhatsAppWebhook(payload, '111222333');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.senderDisplay).toBe('Tarek');
    expect(parsed.events[0]?.providerId).toBe('wamid.HBgN1');
    expect(parsed.events[0]?.threadId).toBe('4915177776666');
  });

  it('ignoriert eine Nutzlast fuer eine fremde Nummer', () => {
    const parsed = parseWhatsAppWebhook(payload, 'andere-nummer');
    expect(parsed.events).toHaveLength(0);
    expect(parsed.ignored).toBe(1);
  });

  it('erzeugt aus Zustellstatus kein Ereignis - sonst ruft Jarvis sich selbst hinterher', () => {
    const statusPayload = {
      ...payload,
      entry: [
        {
          id: '999',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp' as const,
                metadata: { display_phone_number: '4915199998888', phone_number_id: '111222333' },
                statuses: [
                  { id: 'wamid.OWN1', status: 'delivered', timestamp: '1772449080', recipient_id: '4915177776666' },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseWhatsAppWebhook(statusPayload, '111222333');
    expect(parsed.events).toHaveLength(0);
    expect(parsed.statuses).toHaveLength(1);
  });

  it('beschreibt Medien, statt sie zu verschweigen', () => {
    const mediaPayload = {
      ...payload,
      entry: [
        {
          id: '999',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp' as const,
                metadata: { display_phone_number: '4915199998888', phone_number_id: '111222333' },
                messages: [
                  {
                    id: 'wamid.DOC',
                    from: '4915177776666',
                    timestamp: '1772449080',
                    type: 'document',
                    document: { id: 'media-1', filename: 'dienstplan.pdf', mime_type: 'application/pdf' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseWhatsAppWebhook(mediaPayload, '111222333');
    expect(parsed.events[0]?.preview).toContain('dienstplan.pdf');
    expect(parsed.events[0]?.attachments).toHaveLength(1);
  });

  it('ignoriert Reaktionen und unbekannte Typen', () => {
    const reactionPayload = {
      ...payload,
      entry: [
        {
          id: '999',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp' as const,
                metadata: { display_phone_number: '4915199998888', phone_number_id: '111222333' },
                messages: [
                  { id: 'wamid.R', from: '4915177776666', timestamp: '1772449080', type: 'reaction' },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseWhatsAppWebhook(reactionPayload, '111222333');
    expect(parsed.events).toHaveLength(0);
    expect(parsed.ignored).toBe(1);
  });
});

function draftFixture(over: Partial<OutboundDraft> = {}): OutboundDraft {
  return {
    id: 'drf_1' as DraftId,
    channel: 'email',
    providerAccount: 'noah@hermserviceteam.com',
    recipient: 'kroeger@elbe-events.de',
    subject: 'Re: Test',
    body: 'Moin, geht klar.',
    attachments: [],
    threadId: null,
    inReplyToEventId: null,
    createdAt: '2026-03-02T09:00:00.000Z',
    revision: 1,
    ...over,
  };
}

// Hinweis: `vi` wird nicht benutzt, aber der Import haelt die Absicht fest,
// dass hier bewusst KEINE echten Netzaufrufe stattfinden.
void vi;
