#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Jarvis } from '../jarvis.js';
import { AuditLogService } from '../services/audit.js';
import { berichte } from './report.js';

/**
 * JARVIS in der Konsole.
 *
 * Derselbe Kern wie in der Desktop-App, nur ohne Fenster und ohne Sprache.
 * Nützlich zum Prüfen der Einrichtung, für Serverbetrieb und für die
 * Fehlersuche -- die Freigabepflicht gilt hier genauso.
 *
 *   npm run jarvis
 */

const BEFEHLE = `
  Sonderbefehle:
    /status       Einrichtungsstand
    /freigaben    offene Freigaben anzeigen
    /freigabe N   Freigabe Nummer N erteilen
    /ablehnen N   Freigabe Nummer N ablehnen
    /entwuerfe    E-Mail-Entwürfe auflisten
    /versand      Versandzentrale anzeigen
    /protokoll    letzte Protokollzeilen
    /neu          neues Gespräch beginnen
    /ende         beenden
`;

async function main(): Promise<void> {
  const jarvis = Jarvis.create();
  const rl = createInterface({ input: stdin, output: stdout });
  let konversationId = jarvis.startConversation('Konsole');

  console.log('\n  JARVIS');
  console.log('  ──────\n');
  if (!berichte(jarvis)) {
    console.log('  Hinweis: Es fehlt noch etwas. `npm run setup` hilft weiter.\n');
  }
  console.log(BEFEHLE);

  // Werkzeugschritte mitlaufen lassen, damit man sieht, was passiert.
  jarvis.bus.on('tool', (e) => console.log(`    · ${e.summary}`));
  jarvis.bus.on('progress', (e) =>
    console.log(`    · ${e.task}: ${e.done}${e.total ? `/${e.total}` : ''}${e.note ? ` — ${e.note}` : ''}`),
  );

  try {
    for (;;) {
      const eingabe = (await rl.question('\n> ')).trim();
      if (!eingabe) continue;

      if (eingabe.startsWith('/')) {
        const [befehl, argument] = eingabe.slice(1).split(/\s+/, 2);
        if (befehl === 'ende' || befehl === 'exit' || befehl === 'quit') break;
        await sonderbefehl(jarvis, befehl ?? '', argument);
        if (befehl === 'neu') konversationId = jarvis.startConversation('Konsole');
        continue;
      }

      const antwort = await jarvis.ask(eingabe, { conversationId: konversationId });
      if (!antwort.ok) {
        console.log(`\n  Fehler: ${antwort.error.message}`);
        if (antwort.error.hint) console.log(`  ↳ ${antwort.error.hint}`);
        continue;
      }
      console.log(`\n  ${antwort.data.antwort.replace(/\n/g, '\n  ')}`);

      const offen = jarvis.pendingApprovals();
      if (offen.length > 0) {
        console.log(`\n  ⚠ ${offen.length} Freigabe(n) offen — "/freigaben" zeigt sie an.`);
      }
    }
  } finally {
    rl.close();
    jarvis.close();
    console.log('\n  Bis später.\n');
  }
}

async function sonderbefehl(jarvis: Jarvis, befehl: string, argument?: string): Promise<void> {
  switch (befehl) {
    case 'status':
      berichte(jarvis);
      return;

    case 'freigaben': {
      const offen = jarvis.pendingApprovals();
      if (offen.length === 0) {
        console.log('\n  Nichts wartet auf eine Entscheidung.');
        return;
      }
      offen.forEach((a, i) => {
        console.log(`\n  [${i + 1}] ${a.title}`);
        console.log(`      ${a.summary}`);
        for (const d of a.details) {
          if (d.kind === 'long') {
            console.log(`      ${d.label}:`);
            console.log(`        ${d.value.replace(/\n/g, '\n        ')}`);
          } else {
            console.log(`      ${d.label}: ${d.value}`);
          }
        }
      });
      console.log('\n  "/freigabe 1" gibt die erste frei, "/ablehnen 1" verwirft sie.');
      return;
    }

    case 'freigabe':
    case 'ablehnen': {
      const nummer = Number.parseInt(argument ?? '', 10);
      const ziel = jarvis.approvals.resolveByOrdinal(nummer);
      if (!ziel) {
        console.log(`\n  Es gibt keine offene Freigabe mit der Nummer ${argument ?? '(keine)'}.`);
        return;
      }
      if (befehl === 'ablehnen') {
        jarvis.reject(ziel.id, 'Über die Konsole abgelehnt');
        console.log(`\n  Abgelehnt: ${ziel.title}. Der Entwurf bleibt gespeichert.`);
        return;
      }
      const r = await jarvis.approve(ziel.id, 'Über die Konsole freigegeben');
      console.log(r.ok ? `\n  Ausgeführt: ${ziel.title}` : `\n  Fehlgeschlagen: ${r.error.message}`);
      if (!r.ok && r.error.hint) console.log(`  ↳ ${r.error.hint}`);
      return;
    }

    case 'entwuerfe': {
      const rows = jarvis.repos.emails.list({ limit: 30 });
      if (rows.length === 0) {
        console.log('\n  Keine Entwürfe.');
        return;
      }
      rows.forEach((e, i) => {
        console.log(`  [${i + 1}] ${e.status.padEnd(20)} ${e.to_address.padEnd(32)} ${e.subject}`);
      });
      return;
    }

    case 'versand': {
      const zeilen = jarvis.sendingCenter();
      if (zeilen.length === 0) {
        console.log('\n  Die Versandzentrale ist leer.');
        return;
      }
      for (const z of zeilen) {
        console.log(
          `  ${z.companyName.padEnd(30)} ${(z.email ?? '—').padEnd(32)} ` +
            `${(z.verification ?? '—').padEnd(15)} ${z.target.status}`,
        );
      }
      return;
    }

    case 'protokoll': {
      for (const zeile of jarvis.audit.list({ limit: 25 }).reverse()) {
        console.log(`  ${AuditLogService.toSpokenLine(zeile, jarvis.env.JARVIS_LOCALE)}`);
      }
      return;
    }

    case 'neu':
      console.log('\n  Neues Gespräch begonnen.');
      return;

    default:
      console.log(`\n  Unbekannter Befehl "/${befehl}".${BEFEHLE}`);
  }
}

main().catch((e: unknown) => {
  console.error(`\n  Fehler: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
