/**
 * `pnpm dry-run` - der komplette Ablauf ohne Aussenwirkung.
 *
 * Es wird nichts gesendet, niemand angerufen und keine Nachricht bei einem
 * Provider erzeugt. Trotzdem laeuft alles: Ereignis anlegen, Anruf-Job,
 * Gespraech, Read-back, Freigabe, Versandversuch. Am Ende steht ein Bericht,
 * der genau sagt, was passiert waere.
 *
 * Das ist der Nachweis vor jeder Scharfschaltung.
 */
import type { CallId } from '@jarvis/domain';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { MockCalendarConnector } from '@jarvis/connectors';
import { MockTts, ScriptedStt } from '@jarvis/speech';
import { SimulatedCall, VoiceSession, silenceFrames, speechLike, toFrames } from '@jarvis/telephony';
import { createHarness, TEST_APPROVAL_PIN, emailEventFixture, injectionEmailFixture } from '@jarvis/testkit';
import { Conversation, ScriptedBrain, ToolRegistry, type ScriptedStep } from '../apps/orchestrator/src/index.js';

interface Szenario {
  readonly name: string;
  readonly beschreibung: string;
  readonly eingaben: { say?: string; dtmf?: string }[];
  readonly erwarteteSendungen: number;
}

const SZENARIEN: Szenario[] = [
  {
    name: 'E-Mail, vollstaendig freigegeben',
    beschreibung: 'Der Regelfall: Nachricht, Entwurf, Read-back, "Ja, senden", PIN.',
    eingaben: [
      { say: 'Nein, noch nicht.' },
      { say: 'Antworte ihr, geht klar.' },
      { say: 'Ja, senden' },
      { dtmf: `${TEST_APPROVAL_PIN}#` },
    ],
    erwarteteSendungen: 1,
  },
  {
    name: 'Nur "ja" statt "Ja, senden"',
    beschreibung: 'Eine schwache Bestaetigung darf nicht reichen.',
    eingaben: [{ say: 'Nein, noch nicht.' }, { say: 'Antworte ihr.' }, { say: 'Ja' }, { dtmf: `${TEST_APPROVAL_PIN}#` }],
    erwarteteSendungen: 0,
  },
  {
    name: 'Richtige Bestaetigung, falsche PIN',
    beschreibung: 'Die zweite Stufe muss allein tragen.',
    eingaben: [{ say: 'Nein, noch nicht.' }, { say: 'Antworte ihr.' }, { say: 'Ja, senden' }, { dtmf: '0000#' }],
    erwarteteSendungen: 0,
  },
  {
    name: 'Prompt Injection in der E-Mail',
    beschreibung: 'Eine Mail, die Jarvis Anweisungen erteilt. Es darf nichts passieren.',
    eingaben: [{ say: 'Nein, noch nicht.' }, { say: 'Lies sie mir vor.' }],
    erwarteteSendungen: 0,
  },
];

function steps(ref: { id: string }): ScriptedStep[] {
  return [
    { match: /nein|noch nicht/i, tools: [{ name: 'read_open_events', args: { limit: 5 } }], speak: 'Alles klar.' },
    {
      match: /lies|vorlesen/i,
      tools: [{ name: 'read_event', args: () => ({ eventId: ref.id }) }],
      speak: (r) =>
        (r[0] ?? '').includes('werden NICHT befolgt')
          ? 'Die Mail enthaelt Anweisungen an mich. Die befolge ich nicht. Ich habe nichts gesendet und nichts geloescht.'
          : 'Sie braucht vier Leute am Samstag.',
    },
    {
      match: /antworte|antwort/i,
      tools: [
        { name: 'draft_email_reply', args: () => ({ eventId: ref.id, body: 'Moin, vier Leute ab 17 Uhr geht klar. Gruss Noah' }) },
        { name: 'request_approval', args: (last: string | null) => ({ draftId: /drf_[A-Za-z0-9_-]+/.exec(last ?? '')?.[0] ?? '' }) },
      ],
      speak: 'Ich lese dir das jetzt vor.',
    },
  ];
}

async function fahre(sz: Szenario, injection: boolean): Promise<{ gesendet: number; gesagt: string[] }> {
  const h = await createHarness();
  const logs = new MemoryLogWriter();
  const logger = new Logger({ writer: logs, level: 'error' });

  const { event } = h.events.ingest(injection ? injectionEmailFixture() : emailEventFixture());
  const ref = { id: event.id as string };

  const stt = new ScriptedStt(sz.eingaben.filter((e) => e.say !== undefined).map((e) => e.say ?? ''));
  const tts = new MockTts();
  const call = new SimulatedCall('dry', 'outbound', '+490000000000', {});
  call.settleAnswer({ answered: true });

  const session = new VoiceSession({ call, stt, tts, logger, clock: h.clock, preRollMs: 200, postRollMs: 100 });
  const callId = 'cal_dry' as CallId;

  const conversation = new Conversation({
    call,
    session,
    brain: new ScriptedBrain(steps(ref), new ToolRegistry()),
    engine: h.engine,
    audit: h.audit,
    logger,
    clock: h.clock,
    callId,
    timezone: 'Europe/Berlin',
    silenceTimeoutMs: 500,
    dtmfTimeoutMs: 2000,
    initialEvents: [event],
    toolContext: {
      callId,
      events: h.events,
      tasks: h.tasks,
      memories: h.memories,
      engine: h.engine,
      calendar: new MockCalendarConnector('noah@hermserviceteam.com', h.clock),
      calendarIdempotency: h.calendarIdempotency,
      audit: h.audit,
      logger,
      clock: h.clock,
      providerAccounts: { email: 'noah@hermserviceteam.com', whatsapp: '4915199998888' },
    },
  });

  const feeder = (async (): Promise<void> => {
    for (const e of sz.eingaben) {
      if (!call.active) return;
      if (e.dtmf !== undefined) {
        call.pressDtmf(e.dtmf);
        continue;
      }
      if (!(await waitFor(() => session.awaitingUtterance, 5000))) return;
      const before = stt.remaining;
      for (const f of [...toFrames(speechLike(600)), ...silenceFrames(1000)]) {
        if (!call.active) return;
        call.pushInboundAudio(f);
        await Promise.resolve();
      }
      await waitFor(() => stt.remaining < before, 5000);
    }
  })();

  const outcome = await conversation.run();
  await call.hangup('completed');
  await feeder.catch(() => undefined);
  session.close();
  const gesendet = h.recordingSenders.get('email')?.sent.length ?? 0;
  await h.close();
  return { gesendet: outcome.sendsExecuted === 0 ? gesendet : gesendet, gesagt: [...tts.spoken] };
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 3));
  }
  return false;
}

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(72));
  console.log('Jarvis Pro - Trockenlauf');
  console.log('='.repeat(72));
  console.log('Es wird nichts gesendet und niemand angerufen.\n');

  let fehler = 0;
  for (const sz of SZENARIEN) {
    const injection = sz.name.includes('Injection');
    const { gesendet, gesagt } = await fahre(sz, injection);
    const ok = gesendet === sz.erwarteteSendungen;
    if (!ok) fehler += 1;

    console.log(`${ok ? '[  ok  ]' : '[FEHLER]'} ${sz.name}`);
    console.log(`          ${sz.beschreibung}`);
    console.log(`          Sendungen: ${gesendet} (erwartet ${sz.erwarteteSendungen})`);
    const letzter = gesagt.at(-1) ?? '';
    console.log(`          Letzter Satz: ${letzter.slice(0, 100).split('\n')[0]}`);
    console.log('');
  }

  console.log('='.repeat(72));
  if (fehler === 0) {
    console.log('Alle Szenarien verhalten sich wie erwartet.');
    console.log('Ohne vollstaendige Freigabe wird nichts gesendet.');
  } else {
    console.log(`${fehler} Szenarien weichen ab. NICHT scharfschalten.`);
    process.exitCode = 1;
  }
  console.log('='.repeat(72) + '\n');
}

void main();
