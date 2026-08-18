#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Jarvis } from '../jarvis.js';
import { berichte, istEinstiegspunkt } from './report.js';

/**
 * Einrichtungsassistent für die Konsole.
 *
 * Fragt der Reihe nach ab, was noch fehlt, und legt die Angaben verschlüsselt
 * im Datenverzeichnis ab. Bereits gesetzte Werte werden nicht angetastet.
 *
 *   npm run setup
 */

interface Frage {
  schluessel: string;
  titel: string;
  hilfe: string;
  geheim: boolean;
  noetigWenn?: (jarvis: Jarvis) => boolean;
}

const FRAGEN: Frage[] = [
  {
    schluessel: 'ANTHROPIC_API_KEY',
    titel: 'Anthropic-API-Schlüssel',
    hilfe: 'console.anthropic.com → API Keys. Ohne Sprachmodell versteht JARVIS keine Anweisungen.',
    geheim: true,
    noetigWenn: (j) => j.env.JARVIS_LLM_PROVIDER === 'anthropic',
  },
  {
    schluessel: 'OPENAI_API_KEY',
    titel: 'OpenAI-API-Schlüssel',
    hilfe: 'platform.openai.com → API Keys. Nötig für Sprachmodell, Transkription oder Sprachausgabe über OpenAI.',
    geheim: true,
    noetigWenn: (j) =>
      j.env.JARVIS_LLM_PROVIDER === 'openai' ||
      j.env.JARVIS_STT_PROVIDER === 'openai' ||
      j.env.JARVIS_TTS_PROVIDER === 'openai',
  },
  {
    schluessel: 'TAVILY_API_KEY',
    titel: 'Tavily-Schlüssel (Websuche)',
    hilfe: 'tavily.com. Ohne Schlüssel läuft die Recherche über DuckDuckGo und findet deutlich weniger.',
    geheim: true,
    noetigWenn: (j) => j.env.JARVIS_SEARCH_PROVIDER === 'tavily',
  },
  {
    schluessel: 'SMTP_HOST',
    titel: 'SMTP-Server',
    hilfe: 'z. B. smtp.ihr-hoster.de',
    geheim: false,
    noetigWenn: (j) => j.env.JARVIS_MAIL_TRANSPORT === 'smtp',
  },
  {
    schluessel: 'SMTP_USER',
    titel: 'SMTP-Benutzer',
    hilfe: 'Meist die vollständige E-Mail-Adresse.',
    geheim: false,
    noetigWenn: (j) => j.env.JARVIS_MAIL_TRANSPORT === 'smtp',
  },
  {
    schluessel: 'SMTP_PASSWORD',
    titel: 'SMTP-Passwort',
    hilfe: 'Viele Hoster verlangen dafür ein eigenes App-Passwort.',
    geheim: true,
    noetigWenn: (j) => j.env.JARVIS_MAIL_TRANSPORT === 'smtp',
  },
  {
    schluessel: 'IMAP_HOST',
    titel: 'IMAP-Server (optional)',
    hilfe: 'Nur nötig, damit JARVIS eingehende Antworten den Firmen zuordnen kann.',
    geheim: false,
  },
];

async function main(): Promise<void> {
  const jarvis = Jarvis.create();
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('\n  JARVIS — Einrichtung');
  console.log('  ────────────────────\n');
  console.log(`  Datenverzeichnis: ${jarvis.paths.dataDir}`);
  console.log('  Angaben werden verschlüsselt dort abgelegt, nicht in der Datenbank.\n');

  try {
    for (const frage of FRAGEN) {
      if (frage.noetigWenn && !frage.noetigWenn(jarvis)) continue;

      const herkunft = jarvis.credentials.origin(frage.schluessel);
      if (herkunft) {
        console.log(`  ✓ ${frage.titel} — bereits gesetzt (${herkunft})`);
        const aendern = (await rl.question('    Überschreiben? [j/N] ')).trim().toLowerCase();
        if (aendern !== 'j' && aendern !== 'ja') continue;
      } else {
        console.log(`\n  ${frage.titel}`);
        console.log(`  ${frage.hilfe}`);
      }

      const wert = (await rl.question('  > ')).trim();
      if (!wert) {
        console.log('    Übersprungen.\n');
        continue;
      }
      jarvis.credentials.set(frage.schluessel, wert);
      console.log('    Gespeichert.\n');
    }

    console.log('\n  Prüfe die Einrichtung …\n');
    berichte(jarvis);

    if (jarvis.mail.activeTransport?.isConfigured()) {
      const antwort = (await rl.question('  Versandweg jetzt testen (ohne etwas zu senden)? [J/n] ')).trim().toLowerCase();
      if (antwort !== 'n' && antwort !== 'nein') {
        const r = await jarvis.mail.activeTransport.verify();
        console.log(r.ok ? `  ✓ ${r.data.info}\n` : `  ✗ ${r.error.message}\n`);
      }
    }

    console.log('  Fertig. Starten mit: npm start\n');
  } finally {
    rl.close();
    jarvis.close();
  }
}

if (await istEinstiegspunkt(import.meta.url)) {
  await main().catch((e: unknown) => {
    console.error(`\n  Fehler: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}
