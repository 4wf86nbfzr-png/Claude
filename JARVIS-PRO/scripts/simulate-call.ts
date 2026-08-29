/**
 * `pnpm simulate:call` - ein vollstaendiges Telefongespraech im Terminal.
 *
 * Kein Telefon, keine SIM, kein Provider, kein Modell. Was Jarvis sagt, wird
 * ausgegeben; was Noah sagt, wird eingetippt. Der gesamte Ablauf darunter ist
 * echt: Eventstore, Jobqueue, Approval Engine, Freigabe mit Read-back,
 * Sprachbestaetigung und PIN.
 *
 * Damit laesst sich das Verhalten vor jedem Hardwarekauf pruefen - und nach
 * jeder Aenderung wieder.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { CallId } from '@jarvis/domain';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { MockCalendarConnector } from '@jarvis/connectors';
import { MockTts, ScriptedStt } from '@jarvis/speech';
import { SimulatedCall, VoiceSession, silenceFrames, speechLike, toFrames } from '@jarvis/telephony';
import { createHarness, emailEventFixture, whatsappEventFixture } from '@jarvis/testkit';
import { loadDotEnv } from '../apps/orchestrator/src/config.js';
import {
  Conversation,
  ScriptedBrain,
  ToolRegistry,
} from '../apps/orchestrator/src/index.js';
import { buildSteps } from './lib/szenario.js';

const PIN = '4711';

async function main(): Promise<void> {
  const scenario = process.argv[2] ?? 'email';
  const h = await createHarness({ approvalExpiresSeconds: 600 });
  const logs = new MemoryLogWriter();
  const logger = new Logger({ writer: logs, level: 'warn', component: 'simulator' });

  // Ereignis vorbereiten.
  const fixture = scenario === 'whatsapp' ? whatsappEventFixture() : emailEventFixture();
  const { event } = h.events.ingest(fixture);
  const ref = { id: event.id as string };

  h.jobs.enqueue({
    kind: 'call',
    deduplicationKey: `call:${event.id}`,
    payload: { eventId: event.id, reason: scenario === 'whatsapp' ? 'neue WhatsApp-Nachricht' : 'neue E-Mail' },
  });

  // Gespraechstechnik.
  const stt = new ScriptedStt([]);
  const tts = new MockTts();
  // Die Zielnummer kommt aus der Konfiguration, damit die Simulation zeigt,
  // wen Jarvis tatsaechlich anrufen wuerde. Ohne .env die Fixture-Nummer.
  const zielnummer =
    (loadDotEnv()['JARVIS_OWNER_PHONE_E164'] ?? process.env['JARVIS_OWNER_PHONE_E164'] ?? '')
      .trim() || '+4915112345678';
  const call = new SimulatedCall('sim-cli', 'outbound', zielnummer, {});
  call.settleAnswer({ answered: true });

  const session = new VoiceSession({
    call,
    stt,
    tts,
    logger,
    clock: h.clock,
    preRollMs: 200,
    postRollMs: 100,
  });

  const registry = new ToolRegistry();
  const callId = 'cal_sim' as CallId;
  const brain = new ScriptedBrain(
    buildSteps(ref),
    registry,
    'Das habe ich nicht verstanden. Sag es bitte anders.',
  );

  const conversation = new Conversation({
    call,
    session,
    brain,
    engine: h.engine,
    audit: h.audit,
    logger,
    clock: h.clock,
    callId,
    timezone: 'Europe/Berlin',
    silenceTimeoutMs: 3600_000,
    dtmfTimeoutMs: 3600_000,
    callReason: scenario === 'whatsapp' ? 'neue WhatsApp-Nachricht von Tarek' : 'neue E-Mail von Sabine Kroeger',
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

  // Ausgabe von Jarvis mitlesen.
  const seen = new Set<number>();
  const printSpoken = (): void => {
    for (let i = 0; i < tts.spoken.length; i += 1) {
      if (seen.has(i)) continue;
      seen.add(i);
      const text = tts.spoken[i] ?? '';
      console.log(`\n\x1b[36mJARVIS\x1b[0m  ${text.split('\n').join('\n        ')}`);
    }
  };

  // Zwei Betriebsarten: am Terminal wird gefragt, bei durchgeleiteter Eingabe
  // wird die Liste vorab gelesen. readline schliesst sich bei einer Pipe,
  // sobald das Ende erreicht ist - eine Frage danach schlaegt fehl, und der
  // Lauf saehe aus wie ein sofortiges Auflegen.
  const interactive = stdin.isTTY === true;
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  const scripted: string[] = interactive ? [] : (await readAllStdin()).split('\n').map((l) => l.trim());
  let scriptedIndex = 0;

  const nextLine = async (): Promise<string | null> => {
    if (rl !== null) {
      try {
        return (await rl.question('\n\x1b[33mNOAH\x1b[0m    ')).trim();
      } catch {
        return null;
      }
    }
    while (scriptedIndex < scripted.length) {
      const line = scripted[scriptedIndex] ?? '';
      scriptedIndex += 1;
      if (line.length === 0) continue;
      console.log(`\n\x1b[33mNOAH\x1b[0m    ${line}`);
      return line;
    }
    return null;
  };

  console.log('\n' + '='.repeat(72));
  console.log('Jarvis Pro - Gespraechssimulator');
  console.log('='.repeat(72));
  console.log(`Simulierter AUSGEHENDER Anruf an ${zielnummer}.`);
  console.log('Es klingelt nirgends: es gibt keine Telefonleitung. Nichts wird gesendet.');
  console.log(`Freigabe-PIN in dieser Simulation: ${PIN}`);
  console.log('Eingaben: normaler Text, "#<ziffern>" fuer die Tastatur, "tschuess" zum Beenden.');
  console.log('='.repeat(72));

  // Eingaben einspeisen, sobald der Ablauf zuhoert.
  const feeder = (async (): Promise<void> => {
    for (;;) {
      if (!call.active) return;
      // Warten, bis Jarvis fertig gesprochen hat und auf Antwort wartet.
      const waiting = await waitFor(
        () => session.awaitingUtterance || call.awaitingDtmf || !call.active,
        3600_000,
      );
      if (!waiting || !call.active) return;
      printSpoken();

      const line = await nextLine();
      if (line === null) {
        console.log('\n[Eingabe beendet - es wird aufgelegt]');
        await call.hangup('hangup_by_owner');
        return;
      }
      if (line.length === 0) continue;

      if (line.startsWith('#')) {
        call.pressDtmf(`${line.slice(1)}#`);
        continue;
      }

      stt.push(line);
      const before = stt.remaining;
      await feedFrames(call, toFrames(speechLike(600)));
      await feedFrames(call, silenceFrames(1000));
      await waitFor(() => stt.remaining < before, 10_000);
      printSpoken();
    }
  })();

  const outcome = await conversation.run();
  printSpoken();
  rl?.close();
  await feeder.catch(() => undefined);
  session.close();

  console.log('\n' + '='.repeat(72));
  console.log('Ergebnis');
  console.log('='.repeat(72));
  console.log(`Gespraechszuege:        ${outcome.turns}`);
  console.log(`Freigabevorgaenge:      ${outcome.approvalsRun}`);
  console.log(`Tatsaechlich gesendet:  ${outcome.sendsExecuted}`);
  console.log(`Angekuendigte Ereignisse: ${outcome.announcedEventIds.length}`);
  console.log(`Ende:                   ${outcome.endedBecause}`);

  await h.audit.flush();
  const chain = await h.audit.verify();
  const actions = h.db.all<{ action: string }>('SELECT action FROM audit_log ORDER BY seq').map((r) => r.action);
  console.log(`\nAudit-Kette:            ${chain.ok ? 'lueckenlos' : 'GEBROCHEN'}`);
  console.log(`Audit-Eintraege:        ${actions.join(', ') || 'keine'}`);

  const sender = h.recordingSenders.get(scenario === 'whatsapp' ? 'whatsapp' : 'email');
  console.log(`Nachrichten beim Provider: ${sender?.sent.length ?? 0}`);

  const warnings = logs.records().filter((r) => r.level === 'warn' || r.level === 'error');
  if (warnings.length > 0) {
    console.log(`\nAuffaelligkeiten im Log: ${warnings.map((w) => w.msg).join(', ')}`);
  }
  console.log('');

  await h.close();
}

async function feedFrames(call: SimulatedCall, frames: Int16Array[]): Promise<void> {
  for (const f of frames) {
    if (!call.active) return;
    call.pushInboundAudio(f);
    await Promise.resolve();
  }
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return false;
}

void main();
