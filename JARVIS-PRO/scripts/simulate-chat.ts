/**
 * `pnpm simulate:chat` - ein vollstaendiger WhatsApp-Dialog im Terminal.
 *
 * Kein WhatsApp-Konto, kein Meta-Zugang, kein Provider, kein Modell. Was
 * Jarvis schreibt, wird ausgegeben; was Noah schreibt, wird eingetippt. Der
 * gesamte Ablauf darunter ist echt: Eventstore, Approval Engine, Read-back,
 * ausdrueckliche Bestaetigung, zweiter Faktor, Versand.
 *
 * Damit laesst sich pruefen, ob der Chatweg das tut, was er soll - bevor
 * irgendein Konto verbunden ist.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { MockCalendarConnector } from '@jarvis/connectors';
import { generateTotpSecret, otpauthUri, totpCode } from '@jarvis/security';
import { createHarness, emailEventFixture, whatsappEventFixture } from '@jarvis/testkit';
import { loadDotEnv } from '../apps/orchestrator/src/config.js';
import { ChatConversation, ScriptedBrain, ToolRegistry } from '../apps/orchestrator/src/index.js';
import { buildSteps } from './lib/szenario.js';

const PIN = '4711';

async function main(): Promise<void> {
  const szenario = process.argv[2] ?? 'email';
  // Mit "totp" als zweitem Argument laeuft die Simulation mit Einmalcodes
  // statt mit der festen PIN - so laesst sich beides ausprobieren, bevor man
  // sich entscheidet.
  const mitTotp = process.argv.includes('totp');
  const totpSecret = mitTotp ? generateTotpSecret() : undefined;

  const h = await createHarness({
    approvalExpiresSeconds: 3600,
    ...(totpSecret === undefined ? {} : { approvalTotpSecret: totpSecret }),
  });
  const logs = new MemoryLogWriter();
  const logger = new Logger({ writer: logs, level: 'warn', component: 'chat-simulator' });

  const fixture = szenario === 'whatsapp' ? whatsappEventFixture() : emailEventFixture();
  const { event } = h.events.ingest(fixture);
  const ref = { id: event.id as string };

  const eigeneNummer =
    (loadDotEnv()['JARVIS_OWNER_WA_ID'] ?? process.env['JARVIS_OWNER_WA_ID'] ?? '').trim() ||
    '4915112345678';

  const gesendet: string[] = [];
  const registry = new ToolRegistry();
  const brain = new ScriptedBrain(
    buildSteps(ref),
    registry,
    'Das habe ich nicht verstanden. Schreib es bitte anders.',
  );

  const chat = new ChatConversation({
    brain,
    engine: h.engine,
    approvals: h.approvals,
    sessions: h.chatSessions,
    audit: h.audit,
    logger,
    clock: h.clock,
    deliver: async (text: string) => {
      gesendet.push(text);
      console.log(`\n\x1b[36mJARVIS\x1b[0m  ${text.split('\n').join('\n        ')}`);
    },
    ownerWaId: eigeneNummer,
    timezone: 'Europe/Berlin',
    config: {
      idleMinutes: 60,
      requireLoginPin: false,
      maxAnnouncementsPerTurn: 3,
      secondFactorLabel: mitTotp ? 'den Einmalcode aus deiner Authenticator-App' : 'deine Freigabe-PIN',
    },
    toolContext: {
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

  console.log('\n' + '='.repeat(72));
  console.log('Jarvis Pro - Chatsimulator (WhatsApp)');
  console.log('='.repeat(72));
  console.log(`Simulierter Chat mit ${eigeneNummer}.`);
  console.log('Es geht nichts an WhatsApp und nichts an einen Empfaenger. Nichts wird gesendet.');
  if (totpSecret === undefined) {
    console.log(`Freigabe-PIN in dieser Simulation: ${PIN}`);
  } else {
    console.log('Zweiter Faktor: Einmalcode (TOTP).');
    console.log(`  Geheimnis:  ${totpSecret}`);
    console.log(`  otpauth:    ${otpauthUri(totpSecret, 'noah@hermserviceteam.com')}`);
    console.log('  Tipp: statt eines Codes "code" eingeben - dann wird der aktuelle eingesetzt.');
  }
  console.log('Eingaben: normaler Text. "quit" beendet.');
  console.log('='.repeat(72));

  // Jarvis meldet sich von sich aus - genau das passiert im Betrieb, wenn
  // eine Mail hereinkommt und das Antwortfenster offen ist.
  const meldung = await chat.notifyPending();
  if (!meldung.delivered) {
    console.log('\n[Nichts zu melden - schreib einfach los]');
  }

  const interaktiv = stdin.isTTY === true;
  const rl = interaktiv ? createInterface({ input: stdin, output: stdout }) : null;
  const vorgegeben: string[] = interaktiv ? [] : (await readAllStdin()).split('\n').map((l) => l.trim());
  let index = 0;

  const naechsteZeile = async (): Promise<string | null> => {
    if (rl !== null) {
      try {
        return (await rl.question('\n\x1b[33mNOAH\x1b[0m    ')).trim();
      } catch {
        return null;
      }
    }
    while (index < vorgegeben.length) {
      const zeile = vorgegeben[index] ?? '';
      index += 1;
      if (zeile.length === 0) continue;
      console.log(`\n\x1b[33mNOAH\x1b[0m    ${zeile}`);
      return zeile;
    }
    return null;
  };

  let zuege = 0;
  for (;;) {
    const zeile = await naechsteZeile();
    if (zeile === null || /^(quit|exit|ende)$/i.test(zeile)) break;
    if (zeile.length === 0) continue;

    // Bequemlichkeit fuer die Simulation: "code" statt sechs abgetippter
    // Ziffern. Im Betrieb tippt Noah den Code aus seiner App.
    const eingabe =
      totpSecret !== undefined && /^code$/i.test(zeile)
        ? totpCode(totpSecret, Math.floor(h.clock.now().getTime() / 1000))
        : zeile;
    if (eingabe !== zeile) console.log(`        [Einmalcode eingesetzt: ${eingabe}]`);

    zuege += 1;
    await chat.handleMessage(eigeneNummer, eingabe);
  }

  rl?.close();

  const versandt = [...h.recordingSenders.values()].flatMap((s) => s.sent);
  const kette = await h.audit.verify();
  await h.audit.flush();
  const aktionen = h.db
    .all<{ action: string }>('SELECT action FROM audit_log ORDER BY seq', [])
    .map((r) => r.action);

  console.log('\n' + '='.repeat(72));
  console.log('Ergebnis');
  console.log('='.repeat(72));
  console.log(`Nachrichten von Noah:      ${zuege}`);
  console.log(`Nachrichten von Jarvis:    ${gesendet.length}`);
  console.log(`Tatsaechlich versendet:    ${versandt.length}`);
  console.log(`Noch nicht genannt:        ${h.events.countUnannounced()}`);
  console.log(`\nAudit-Kette:               ${kette.ok ? 'lueckenlos' : 'BESCHAEDIGT'}`);
  console.log(`Audit-Eintraege:           ${[...new Set(aktionen)].join(', ')}`);
  console.log('');

  await h.close();
}

async function readAllStdin(): Promise<string> {
  const stuecke: string[] = [];
  stdin.setEncoding('utf8');
  for await (const stueck of stdin) stuecke.push(String(stueck));
  return stuecke.join('');
}

void main();
