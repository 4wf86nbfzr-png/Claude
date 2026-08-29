import { describe, expect, it } from 'vitest';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { MockTts, ScriptedStt } from '@jarvis/speech';
import { FakeClock } from '@jarvis/testkit';
import { SimulatedCall, SimulatedTelephony, speechLike, toFrames, silenceFrames } from './simulator.js';
import { VoiceSession } from './voice-session.js';

function makeSession(utterances: string[]): {
  call: SimulatedCall;
  session: VoiceSession;
  tts: MockTts;
  stt: ScriptedStt;
} {
  const call = new SimulatedCall('test-1', 'inbound', '+4915112345678', {});
  const stt = new ScriptedStt(utterances);
  const tts = new MockTts();
  const session = new VoiceSession({
    call,
    stt,
    tts,
    logger: new Logger({ writer: new MemoryLogWriter(), level: 'error' }),
    clock: new FakeClock(),
    preRollMs: 200,
    postRollMs: 100,
    bargeInMs: 100,
  });
  return { call, session, tts, stt };
}

/** Schiebt Audio frameweise in den Anruf, mit einer Pause zwischen den Frames. */
async function feed(call: SimulatedCall, frames: Int16Array[], pauseMs = 0): Promise<void> {
  for (const f of frames) {
    call.pushInboundAudio(f);
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    else await Promise.resolve();
  }
}

describe('VoiceSession - Erkennung', () => {
  it('erkennt eine Aeusserung zwischen zwei Stillephasen', async () => {
    const { call, session } = makeSession(['Moin, alles erledigt.']);
    session.start();

    const next = session.nextUtterance(2000);
    await feed(call, silenceFrames(200));
    await feed(call, toFrames(speechLike(700)));
    await feed(call, silenceFrames(1200));

    const u = await next;
    expect(u).not.toBeNull();
    expect(u?.text).toBe('Moin, alles erledigt.');
    session.close();
  });

  it('nimmt Vorlauf mit, damit die erste Silbe nicht fehlt', async () => {
    const { call, session, stt } = makeSession(['Test']);
    session.start();

    const next = session.nextUtterance(2000);
    await feed(call, silenceFrames(400));
    await feed(call, toFrames(speechLike(600)));
    await feed(call, silenceFrames(1200));
    await next;

    // Das an die Erkennung uebergebene Audio muss laenger sein als die
    // reine Sprachdauer - sonst waere kein Vorlauf dabei.
    const passed = stt.transcribed[0];
    expect(passed).toBeDefined();
    const passedMs = ((passed?.samples ?? 0) / (passed?.sampleRate ?? 16000)) * 1000;
    expect(passedMs).toBeGreaterThan(600);
    session.close();
  });

  it('meldet null, wenn nichts gesagt wird', async () => {
    const { call, session } = makeSession([]);
    session.start();

    const next = session.nextUtterance(150);
    await feed(call, silenceFrames(400));
    expect(await next).toBeNull();
    session.close();
  });

  it('gibt null zurueck, wenn aufgelegt wird', async () => {
    const { call, session } = makeSession([]);
    session.start();

    const next = session.nextUtterance(3000);
    await call.hangup('hangup_by_owner');
    expect(await next).toBeNull();
    session.close();
  });
});

describe('VoiceSession - Sprachausgabe', () => {
  it('gibt einen vollstaendigen Text aus', async () => {
    const { call, session, tts } = makeSession([]);
    session.start();

    const r = await session.speak('Moin, mein Achi. Ich habe zwei neue Nachrichten.');
    expect(r.completed).toBe(true);
    expect(r.interrupted).toBe(false);
    expect(tts.completedSentences).toHaveLength(2);
    expect(call.playedSamples.length).toBe(2);
    session.close();
  });

  it('misst die Zeit bis zum ersten Audio', async () => {
    const { session } = makeSession([]);
    session.start();
    const r = await session.speak('Kurzer Satz.');
    expect(r.ttsTimeToFirstAudioMs).not.toBeNull();
    session.close();
  });
});

describe('VoiceSession - Barge-in', () => {
  it('bricht die laufende Ausgabe ab, sobald Noah spricht', async () => {
    const { call, session, tts } = makeSession(['Stopp, das reicht.']);
    // Genug Zeit pro Satz, damit die Unterbrechung mitten in der Ausgabe faellt.
    tts.msPerSentence = 60;
    session.start();

    const speaking = session.speak(
      'Erster Satz. Zweiter Satz. Dritter Satz. Vierter Satz. Fuenfter Satz.',
    );

    // Kurz laufen lassen, dann sprechen.
    await new Promise((r) => setTimeout(r, 80));
    await feed(call, toFrames(speechLike(400)), 1);

    const result = await speaking;

    expect(result.interrupted).toBe(true);
    expect(result.completed).toBe(false);
    expect(tts.completedSentences.length).toBeLessThan(5);
    expect(call.stopAudioCount).toBeGreaterThan(0);
    session.close();
  });

  it('markiert die unterbrechende Aeusserung als Unterbrechung', async () => {
    const { call, session, tts } = makeSession(['Stopp, das reicht.']);
    tts.msPerSentence = 60;
    session.start();

    const next = session.nextUtterance(3000);
    const speaking = session.speak('Erster Satz. Zweiter Satz. Dritter Satz. Vierter Satz.');

    await new Promise((r) => setTimeout(r, 80));
    await feed(call, toFrames(speechLike(500)), 1);
    await speaking;
    await feed(call, silenceFrames(1200), 1);

    const u = await next;
    expect(u?.text).toBe('Stopp, das reicht.');
    expect(u?.interrupted).toBe(true);
    session.close();
  });

  it('bricht bei blosser Stille nicht ab', async () => {
    const { call, session, tts } = makeSession([]);
    tts.msPerSentence = 30;
    session.start();

    const speaking = session.speak('Erster Satz. Zweiter Satz. Dritter Satz.');
    await feed(call, silenceFrames(300), 1);
    const result = await speaking;

    expect(result.interrupted).toBe(false);
    expect(result.completed).toBe(true);
    expect(tts.completedSentences).toHaveLength(3);
    session.close();
  });
});

describe('Telefonie-Simulator', () => {
  it('meldet Nichtannahme', async () => {
    const sim = new SimulatedTelephony({
      ownerPhone: '+4915112345678',
      jarvisPhone: '+4915199998888',
      clock: new FakeClock(),
    });
    await sim.start();
    sim.queueScript({ answerBehaviour: 'no_answer' });

    const call = await sim.dialOwner('Test');
    const result = await call.answered();
    expect(result.answered).toBe(false);
    if (!result.answered) expect(result.reason).toBe('no_answer');
    await sim.stop();
  });

  it('meldet Besetzt und Netzfehler', async () => {
    const sim = new SimulatedTelephony({
      ownerPhone: '+4915112345678',
      jarvisPhone: '+4915199998888',
      clock: new FakeClock(),
    });
    await sim.start();
    sim.queueScript({ answerBehaviour: 'busy' }, { answerBehaviour: 'network_error' });

    const busy = await (await sim.dialOwner('Test')).answered();
    const err = await (await sim.dialOwner('Test')).answered();
    expect(busy.answered).toBe(false);
    if (!busy.answered) expect(busy.reason).toBe('busy');
    if (!err.answered) expect(err.reason).toBe('network_error');
    await sim.stop();
  });

  it('reicht eingehende Anrufe an den Handler durch', async () => {
    const sim = new SimulatedTelephony({
      ownerPhone: '+4915112345678',
      jarvisPhone: '+4915199998888',
      clock: new FakeClock(),
    });
    await sim.start();

    const seen: string[] = [];
    sim.onIncomingCall((c) => {
      seen.push(c.callerId ?? 'unbekannt');
    });
    await sim.simulateIncoming('+4915112345678');
    expect(seen).toEqual(['+4915112345678']);
    await sim.stop();
  });

  it('liefert DTMF-Eingaben', async () => {
    const call = new SimulatedCall('t', 'inbound', '+49', {});
    call.pressDtmf('4711#');
    expect(await call.collectDtmf(12, 1000)).toBe('4711');
    expect(await call.collectDtmf(12, 1000)).toBeNull();
  });
});
