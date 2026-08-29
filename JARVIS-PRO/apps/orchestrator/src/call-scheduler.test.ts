import { beforeEach, describe, expect, it } from 'vitest';
import type { E164, InboundEvent } from '@jarvis/domain';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { SimulatedTelephony, type CallHandle } from '@jarvis/telephony';
import { createHarness, emailEventFixture, whatsappEventFixture, type Harness } from '@jarvis/testkit';
import { CALL_JOB_KIND, CallScheduler, type ActiveConversation } from './call-scheduler.js';

const OWNER = '+4915112345678' as E164;

let h: Harness;
let telephony: SimulatedTelephony;
let scheduler: CallScheduler;
let conversations: { call: CallHandle; eventId: string }[];
let active: ActiveConversation | null;

beforeEach(async () => {
  h = await createHarness();
  telephony = new SimulatedTelephony({
    ownerPhone: OWNER,
    jarvisPhone: '+4915199998888',
    clock: h.clock,
  });
  await telephony.start();
  conversations = [];
  active = null;

  scheduler = new CallScheduler({
    jobs: h.jobs,
    events: h.events,
    calls: h.calls,
    telephony,
    audit: h.audit,
    logger: new Logger({ writer: new MemoryLogWriter(), level: 'error' }),
    clock: h.clock,
    config: {
      ownerPhone: OWNER,
      callOnEveryNewEmail: true,
      callOnEveryNewWhatsapp: true,
      retrySeconds: 120,
      maxCallsPerHour: 60,
      maxAttempts: 2,
    },
    runConversation: async (call, payload) => {
      conversations.push({ call, eventId: payload.eventId });
    },
    activeConversation: () => active,
  });
});

function ingestEmail(over: Parameters<typeof emailEventFixture>[0] = {}): InboundEvent {
  return h.events.ingest(emailEventFixture(over)).event;
}

describe('Anruf-Jobs', () => {
  it('erzeugt genau einen Job je Ereignis', () => {
    const event = ingestEmail();
    expect(scheduler.scheduleForEvent(event).kind).toBe('enqueued');
    expect(scheduler.scheduleForEvent(event).kind).toBe('duplicate');
    expect(h.jobs.countByState(CALL_JOB_KIND, 'PENDING')).toBe(1);
  });

  it('mehrfache Providerzustellung erzeugt nur einen Job', () => {
    // Der Eventstore dedupliziert bereits - dieselbe Nachricht ergibt dasselbe Ereignis.
    const first = h.events.ingest(emailEventFixture());
    const second = h.events.ingest(emailEventFixture());
    expect(second.isNew).toBe(false);

    scheduler.scheduleForEvent(first.event);
    scheduler.scheduleForEvent(second.event);
    expect(h.jobs.countByState(CALL_JOB_KIND, 'PENDING')).toBe(1);
  });

  it('ruft bei selbst erzeugten Ereignissen nicht an', () => {
    const event = ingestEmail({ selfOriginated: true, providerId: 'eigene-antwort' });
    expect(scheduler.scheduleForEvent(event).kind).toBe('skipped');
    expect(h.jobs.countByState(CALL_JOB_KIND, 'PENDING')).toBe(0);
  });

  it('respektiert den Schalter je Kanal', async () => {
    const noWhatsapp = new CallScheduler({
      jobs: h.jobs,
      events: h.events,
      calls: h.calls,
      telephony,
      audit: h.audit,
      logger: new Logger({ writer: new MemoryLogWriter(), level: 'error' }),
      clock: h.clock,
      config: {
        ownerPhone: OWNER,
        callOnEveryNewEmail: true,
        callOnEveryNewWhatsapp: false,
        retrySeconds: 120,
        maxCallsPerHour: 60,
        maxAttempts: 2,
      },
      runConversation: async () => undefined,
      activeConversation: () => null,
    });

    const wa = h.events.ingest(whatsappEventFixture()).event;
    expect(noWhatsapp.scheduleForEvent(wa).kind).toBe('skipped');
  });
});

describe('Anrufdurchfuehrung', () => {
  it('ruft an und fuehrt das Gespraech', async () => {
    const event = ingestEmail();
    scheduler.scheduleForEvent(event);
    telephony.queueScript({ answerBehaviour: 'answer' });

    expect(await scheduler.tick()).toBe(true);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.eventId).toBe(event.id);
    expect(h.jobs.countByState(CALL_JOB_KIND, 'DONE')).toBe(1);
    expect(h.events.byId(event.id)?.handled).toBe(true);
  });

  it('startet keinen zweiten Anruf, solange einer laeuft', async () => {
    const a = ingestEmail({ providerId: 'a' });
    const b = ingestEmail({ providerId: 'b' });
    scheduler.scheduleForEvent(a);
    scheduler.scheduleForEvent(b);

    // Anruf kuenstlich offen halten.
    h.calls.start('outbound', OWNER);
    expect(await scheduler.tick()).toBe(false);
    expect(conversations).toHaveLength(0);
  });

  it('reiht ein Ereignis in ein laufendes Gespraech ein', () => {
    const enqueued: string[] = [];
    active = {
      enqueueEvent: (e) => enqueued.push(e.id),
      pendingEventCount: 0,
    };
    const event = ingestEmail();
    scheduler.scheduleForEvent(event);

    expect(enqueued).toEqual([event.id]);
    // Der Job wird trotzdem angelegt - bricht das Gespraech ab, geht nichts verloren.
    expect(h.jobs.countByState(CALL_JOB_KIND, 'PENDING')).toBe(1);
  });

  it('ueberspringt einen Job, dessen Ereignis inzwischen besprochen wurde', async () => {
    const event = ingestEmail();
    scheduler.scheduleForEvent(event);
    h.events.markHandled(event.id);

    expect(await scheduler.tick()).toBe(true);
    expect(conversations).toHaveLength(0);
    expect(h.jobs.countByState(CALL_JOB_KIND, 'DONE')).toBe(1);
  });
});

describe('Nicht zustande gekommene Anrufe', () => {
  it('versucht es nach Nichtannahme spaeter erneut', async () => {
    const event = ingestEmail();
    scheduler.scheduleForEvent(event);
    telephony.queueScript({ answerBehaviour: 'no_answer' });

    await scheduler.tick();
    expect(conversations).toHaveLength(0);

    // Sofort ist nichts faellig.
    expect(h.jobs.claim(CALL_JOB_KIND)).toBeNull();

    // Nach der Wartezeit schon.
    h.clock.advanceSeconds(121);
    expect(h.jobs.claim(CALL_JOB_KIND)).not.toBeNull();
  });

  it.each(['busy', 'network_error', 'rejected'] as const)('behandelt %s als spaeteren Versuch', async (behaviour) => {
    const event = ingestEmail();
    scheduler.scheduleForEvent(event);
    telephony.queueScript({ answerBehaviour: behaviour });

    await scheduler.tick();
    h.clock.advanceSeconds(121);
    expect(h.jobs.claim(CALL_JOB_KIND)).not.toBeNull();
  });

  it('laesst das Ereignis nach dem letzten Versuch offen, statt es zu verlieren', async () => {
    const event = ingestEmail();
    scheduler.scheduleForEvent(event);

    telephony.queueScript({ answerBehaviour: 'no_answer' }, { answerBehaviour: 'no_answer' });
    await scheduler.tick();
    h.clock.advanceSeconds(121);
    await scheduler.tick();

    expect(h.jobs.countByState(CALL_JOB_KIND, 'DEAD_LETTER')).toBe(1);
    // Entscheidend: das Ereignis bleibt offen.
    expect(h.events.byId(event.id)?.handled).toBe(false);
    expect(h.events.countOpen()).toBe(1);
    expect(h.events.openEvents()[0]?.id).toBe(event.id);
  });
});

describe('Notbremse gegen Anrufschleifen', () => {
  it('pausiert Jobs beim Stundenlimit, ohne sie zu loeschen', async () => {
    const limited = new CallScheduler({
      jobs: h.jobs,
      events: h.events,
      calls: h.calls,
      telephony,
      audit: h.audit,
      logger: new Logger({ writer: new MemoryLogWriter(), level: 'error' }),
      clock: h.clock,
      config: {
        ownerPhone: OWNER,
        callOnEveryNewEmail: true,
        callOnEveryNewWhatsapp: true,
        retrySeconds: 120,
        maxCallsPerHour: 2,
        maxAttempts: 3,
      },
      runConversation: async () => undefined,
      activeConversation: () => null,
    });

    // Zwei Anrufe in der letzten Stunde beenden - Limit erreicht.
    const c1 = h.calls.start('outbound', OWNER);
    h.calls.end(c1.id, 'completed');
    const c2 = h.calls.start('outbound', OWNER);
    h.calls.end(c2.id, 'completed');

    limited.scheduleForEvent(ingestEmail());
    expect(await limited.tick()).toBe(false);
    expect(h.jobs.countByState(CALL_JOB_KIND, 'PAUSED')).toBe(1);
    expect(limited.status().limitReached).toBe(true);

    // Nach einer Stunde geht es weiter - nichts ist verloren.
    h.clock.advanceSeconds(3601);
    expect(limited.resumeIfPossible()).toBe(1);
    expect(h.jobs.countByState(CALL_JOB_KIND, 'PENDING')).toBe(1);
  });
});

describe('Neustart', () => {
  it('nimmt haengengebliebene Jobs wieder auf', async () => {
    const event = ingestEmail();
    scheduler.scheduleForEvent(event);
    h.jobs.claim(CALL_JOB_KIND, 300);

    // Absturz waehrend der Bearbeitung.
    h.clock.advanceSeconds(301);
    expect(scheduler.recoverAfterRestart()).toBe(1);

    telephony.queueScript({ answerBehaviour: 'answer' });
    expect(await scheduler.tick()).toBe(true);
    expect(conversations).toHaveLength(1);
  });

  it('meldet den Zustand fuer die Diagnose', () => {
    scheduler.scheduleForEvent(ingestEmail());
    const s = scheduler.status();
    expect(s.pending).toBe(1);
    expect(s.openEvents).toBe(1);
    expect(s.deadLetter).toBe(0);
  });
});
