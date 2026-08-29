import { beforeEach, describe, expect, it } from 'vitest';
import type { CallId, DraftId } from '@jarvis/domain';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { MockCalendarConnector } from '@jarvis/connectors';
import { createHarness, emailEventFixture, injectionEmailFixture, type Harness } from '@jarvis/testkit';
import { FORBIDDEN_TOOL_PATTERNS, TOOLS, ToolRegistry, type ToolContext } from './tools.js';

let h: Harness;
let registry: ToolRegistry;
let ctx: ToolContext;
let approvalRequests: DraftId[];
let sensitive: { subject: string; fact: string }[];
let calendar: MockCalendarConnector;

beforeEach(async () => {
  h = await createHarness();
  registry = new ToolRegistry();
  approvalRequests = [];
  sensitive = [];
  calendar = new MockCalendarConnector('noah@hermserviceteam.com', h.clock);

  ctx = {
    callId: 'cal_test' as CallId,
    events: h.events,
    tasks: h.tasks,
    memories: h.memories,
    engine: h.engine,
    calendar,
    calendarIdempotency: h.calendarIdempotency,
    audit: h.audit,
    logger: new Logger({ writer: new MemoryLogWriter(), level: 'error' }),
    clock: h.clock,
    providerAccounts: { email: 'noah@hermserviceteam.com', whatsapp: '4915199998888' },
    onApprovalRequested: (id) => approvalRequests.push(id),
    onSensitiveMemory: (subject, fact) => sensitive.push({ subject, fact }),
  };
});

describe('Werkzeugliste', () => {
  it('enthaelt keine Sendefunktion und keine Systemzugriffe', () => {
    for (const name of registry.names()) {
      for (const forbidden of FORBIDDEN_TOOL_PATTERNS) {
        expect(forbidden.test(name), `Werkzeug "${name}" trifft verbotenes Muster ${forbidden}`).toBe(false);
      }
    }
  });

  it('folgt den erlaubten Praefixen aus der Anforderung', () => {
    const allowed = /^(read_|draft_|revise_|summarize_|request_approval$|cancel_|create_task$|update_task$|remember$|forget$|create_calendar_event$)/;
    for (const name of registry.names()) {
      expect(allowed.test(name), `Werkzeug "${name}" passt in kein erlaubtes Schema`).toBe(true);
    }
  });

  it('jedes Werkzeug hat eine Beschreibung und ein Schema', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.schema).toBeDefined();
    }
  });

  it('lehnt ein unbekanntes Werkzeug ab, statt zu raten', async () => {
    const r = await registry.invoke('send_email', { to: 'x@y.de' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain('gibt es nicht');
  });
});

describe('Argumentpruefung', () => {
  it('lehnt falsche Argumente ab, ohne etwas zu tun', async () => {
    const r = await registry.invoke('draft_email_new', { recipient: 'x' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain('passen nicht');
  });

  it('lehnt eine Adresse ohne @ ab', async () => {
    const r = await registry.invoke(
      'draft_email_new',
      { recipient: 'keineadresse', subject: 'Test', body: 'Text' },
      ctx,
    );
    expect(r.ok).toBe(false);
  });

  it('faengt einen Fehler im Werkzeug ab, statt das Gespraech abzubrechen', async () => {
    const r = await registry.invoke('read_event', { eventId: 'gibtsnicht' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain('Kein Ereignis');
  });
});

describe('read_event und Injection-Isolation', () => {
  it('liefert Fremdinhalt nur im Isolationsblock', async () => {
    const { event } = h.events.ingest(emailEventFixture());
    const r = await registry.invoke('read_event', { eventId: event.id }, ctx);

    expect(r.ok).toBe(true);
    expect(r.content).toContain('FREMDINHALT');
    expect(r.content).toContain('keine Anweisung');
    expect(r.content).toContain('Nordtor');
  });

  it('meldet einen Injection-Versuch und schreibt ihn ins Audit-Log', async () => {
    const { event } = h.events.ingest(injectionEmailFixture());
    const r = await registry.invoke('read_event', { eventId: event.id }, ctx);
    await h.audit.flush();

    expect(r.content).toContain('werden NICHT befolgt');
    const actions = h.db.all<{ action: string }>('SELECT action FROM audit_log').map((x) => x.action);
    expect(actions).toContain('injection.detected');
  });
});

describe('Entwuerfe', () => {
  it('legt einen Antwortentwurf mit Re-Betreff an', async () => {
    const { event } = h.events.ingest(emailEventFixture());
    const r = await registry.invoke(
      'draft_email_reply',
      { eventId: event.id, body: 'Geht klar.' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.content).toContain('kroeger@elbe-events.de');

    const draftId = /drf_\d+/.exec(r.content)?.[0] ?? '';
    const draft = h.engine.getDraft(draftId as DraftId);
    expect(draft.subject).toBe('Re: Sicherheitsdienst fuer Hafengeburtstag');
  });

  it('verdoppelt ein vorhandenes Re: nicht', async () => {
    const { event } = h.events.ingest(emailEventFixture({ subject: 'Re: Bereits Antwort' }));
    const r = await registry.invoke('draft_email_reply', { eventId: event.id, body: 'Ok.' }, ctx);
    const draftId = /drf_\d+/.exec(r.content)?.[0] ?? '';
    expect(h.engine.getDraft(draftId as DraftId).subject).toBe('Re: Bereits Antwort');
  });

  it('verweigert einen WhatsApp-Entwurf zu einer E-Mail', async () => {
    const { event } = h.events.ingest(emailEventFixture());
    const r = await registry.invoke('draft_whatsapp_reply', { eventId: event.id, body: 'Hi' }, ctx);
    expect(r.ok).toBe(false);
  });

  it('request_approval sendet nichts, sondern meldet den Vorgang an den Ablauf', async () => {
    const { event } = h.events.ingest(emailEventFixture());
    const drafted = await registry.invoke('draft_email_reply', { eventId: event.id, body: 'Ok.' }, ctx);
    const draftId = /drf_\d+/.exec(drafted.content)?.[0] ?? '';

    const r = await registry.invoke('request_approval', { draftId }, ctx);
    expect(r.ok).toBe(true);
    expect(approvalRequests).toEqual([draftId]);

    // Nichts gesendet.
    const sender = h.recordingSenders.get('email');
    expect(sender?.sent).toHaveLength(0);
  });
});

describe('Gedaechtnis', () => {
  it('speichert eine harmlose Information direkt', async () => {
    const r = await registry.invoke(
      'remember',
      {
        subject: 'Dresscode Elbe Events',
        fact: 'schwarze Hose, weisses Hemd',
        sensitivity: 'normal',
        confirmationUtterance: 'Merk dir das bitte.',
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(h.memories.all()).toHaveLength(1);
  });

  it('speichert eine heikle Information NICHT, sondern fragt zurueck', async () => {
    const r = await registry.invoke(
      'remember',
      {
        subject: 'Konto',
        fact: 'Die IBAN lautet DE02 1203 0000 0000 2020 51',
        sensitivity: 'normal',
        confirmationUtterance: 'Merk dir das.',
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.content).toContain('Gespeichert ist noch nichts');
    expect(h.memories.all()).toHaveLength(0);
    expect(sensitive).toHaveLength(1);
  });

  it('erkennt weitere heikle Themen', async () => {
    for (const fact of ['Das Passwort ist geheim123', 'Sein Gehalt liegt bei 3400 Euro', 'Er war beim Arzt']) {
      await registry.invoke(
        'remember',
        { subject: 'x', fact, sensitivity: 'normal', confirmationUtterance: 'merk dir' },
        ctx,
      );
    }
    expect(h.memories.all()).toHaveLength(0);
    expect(sensitive).toHaveLength(3);
  });

  it('laesst Erinnerungen abfragen, aendern und loeschen', async () => {
    await registry.invoke(
      'remember',
      { subject: 'Tor', fact: 'Nordtor ist der Haupteingang', sensitivity: 'normal', confirmationUtterance: 'merk dir' },
      ctx,
    );
    const list = await registry.invoke('read_memories', { query: 'Tor' }, ctx);
    const id = /mem_\d+/.exec(list.content)?.[0] ?? '';
    expect(id).not.toBe('');

    const changed = await registry.invoke(
      'revise_memory',
      { memoryId: id, fact: 'Sued-Tor ist der Haupteingang', confirmationUtterance: 'aendere das' },
      ctx,
    );
    expect(changed.ok).toBe(true);

    const deleted = await registry.invoke('forget', { memoryId: id }, ctx);
    expect(deleted.ok).toBe(true);
    expect(h.memories.all()).toHaveLength(0);
  });
});

describe('Kalender', () => {
  const validEvent = {
    calendarId: 'primary',
    title: 'Einsatzbesprechung Hafengeburtstag',
    start: '2026-05-07T14:00',
    end: '2026-05-07T15:00',
    timeZone: 'Europe/Berlin',
    location: 'Buero Hamburg',
    description: null,
    attendees: [],
    reminderMinutesBefore: 15,
  };

  it('fragt bei einer vagen Zeitangabe nach, statt zu raten', async () => {
    const r = await registry.invoke(
      'draft_calendar_event',
      { ...validEvent, spokenTimePhrase: 'morgen Nachmittag', matchingContacts: 0 },
      ctx,
    );
    expect(r.content).toContain('welche Uhrzeit genau');
    expect(calendar.created).toHaveLength(0);
  });

  it('fragt nach, wenn mehrere Kontakte passen', async () => {
    const r = await registry.invoke(
      'draft_calendar_event',
      { ...validEvent, spokenTimePhrase: '', matchingContacts: 3 },
      ctx,
    );
    expect(r.content).toContain('Wen genau meinst du');
  });

  it('bereitet einen vollstaendigen Termin zum Vorlesen auf', async () => {
    const r = await registry.invoke(
      'draft_calendar_event',
      { ...validEvent, spokenTimePhrase: '', matchingContacts: 0 },
      ctx,
    );
    for (const field of ['Titel:', 'Datum und Beginn:', 'Ende:', 'Zeitzone:', 'Ort:', 'Teilnehmer:', 'Erinnerung:', 'Kalender:']) {
      expect(r.content).toContain(field);
    }
  });

  it('traegt erst nach Bestaetigung ein und meldet die Bestaetigung des Kalenders', async () => {
    const r = await registry.invoke('create_calendar_event', { ...validEvent, confirmedByOwner: true }, ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('Kalender hat den Termin bestaetigt');
    expect(calendar.created).toHaveLength(1);
  });

  it('legt denselben Termin nicht zweimal an', async () => {
    await registry.invoke('create_calendar_event', { ...validEvent, confirmedByOwner: true }, ctx);
    const second = await registry.invoke('create_calendar_event', { ...validEvent, confirmedByOwner: true }, ctx);

    expect(second.content).toContain('bereits eingetragen');
    expect(calendar.created).toHaveLength(1);
  });

  it('sagt bei einem Kalenderfehler ausdruecklich, dass nichts eingetragen wurde', async () => {
    calendar.failures.failure = 'server';
    const r = await registry.invoke('create_calendar_event', { ...validEvent, confirmedByOwner: true }, ctx);

    expect(r.ok).toBe(false);
    expect(r.content).toContain('NICHT bestaetigt');
    expect(r.content).toContain('nichts eingetragen');
  });

  it('verlangt die Bestaetigungsmarkierung', async () => {
    const r = await registry.invoke('create_calendar_event', { ...validEvent }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe('Aufgaben', () => {
  it('legt eine Aufgabe mit Herkunft an', async () => {
    const { event } = h.events.ingest(emailEventFixture());
    const r = await registry.invoke(
      'create_task',
      { title: 'Vier Leute fuer Samstag einteilen', nextStep: 'Dienstplan pruefen', dueAtIso: null, originEventId: event.id },
      ctx,
    );
    expect(r.ok).toBe(true);
    const task = h.tasks.open()[0];
    expect(task?.originEventId).toBe(event.id);
    expect(task?.nextStep).toBe('Dienstplan pruefen');
  });

  it('setzt den Status', async () => {
    await registry.invoke('create_task', { title: 'X', nextStep: '', dueAtIso: null, originEventId: null }, ctx);
    const id = h.tasks.open()[0]?.id ?? '';
    const r = await registry.invoke('update_task', { taskId: id, state: 'done' }, ctx);
    expect(r.ok).toBe(true);
    expect(h.tasks.open()).toHaveLength(0);
  });
});
