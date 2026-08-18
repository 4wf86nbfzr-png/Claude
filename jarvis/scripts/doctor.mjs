#!/usr/bin/env node
/**
 * Diagnose: reports what is in place and what is missing, without changing
 * anything. Run with `npm run doctor`.
 */
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { databaseFile, resolveDataDir } from './dataDir.mjs';

const require_ = createRequire(import.meta.url);

const ENV_KEYS = [
  ['ANTHROPIC_API_KEY', 'Sprachmodell (Anthropic)'],
  ['OPENAI_API_KEY', 'OpenAI (Modell, Whisper, Sprachausgabe)'],
  ['ELEVENLABS_API_KEY', 'Sprachausgabe ElevenLabs'],
  ['BRAVE_SEARCH_API_KEY', 'Suche (Brave)'],
  ['TAVILY_API_KEY', 'Suche (Tavily)'],
  ['SERPAPI_API_KEY', 'Suche (SerpAPI)'],
  ['SMTP_PASSWORD', 'Postausgang SMTP'],
  ['IMAP_PASSWORD', 'Posteingang IMAP'],
  ['GMAIL_CLIENT_SECRET', 'Gmail OAuth'],
  ['GMAIL_REFRESH_TOKEN', 'Gmail OAuth'],
];

const lines = [];
const say = (symbol, text) => lines.push(`${symbol} ${text}`);

// --- Laufzeit -------------------------------------------------------------

const [major, minor] = process.versions.node.split('.').map(Number);
const nodeOk = major > 22 || (major === 22 && minor >= 5);
say(nodeOk ? '✓' : '✕', `Node ${process.versions.node}${nodeOk ? '' : ' — benötigt wird 22.5 oder neuer'}`);

let driver = null;
try {
  require_('better-sqlite3');
  driver = 'better-sqlite3';
} catch {
  try {
    const { DatabaseSync } = require_('node:sqlite');
    new DatabaseSync(':memory:').close();
    driver = 'node:sqlite';
  } catch (error) {
    say('✕', `Keine SQLite-Unterstützung: ${error.message}`);
  }
}
if (driver) say('✓', `SQLite über ${driver}`);

for (const name of ['electron', 'nodemailer', 'imapflow', 'cheerio', 'zod', '@anthropic-ai/sdk']) {
  try {
    require_.resolve(name);
    say('✓', `Abhängigkeit ${name}`);
  } catch {
    say('✕', `Abhängigkeit ${name} fehlt — npm install ausführen`);
  }
}

// --- Daten ----------------------------------------------------------------

const dataDir = resolveDataDir();
const dbFile = databaseFile();
say(existsSync(dataDir) ? '✓' : '·', `Datenordner ${dataDir}${existsSync(dataDir) ? '' : ' (wird beim ersten Start angelegt)'}`);

if (existsSync(dbFile) && driver) {
  const size = (statSync(dbFile).size / 1024).toFixed(0);
  say('✓', `Datenbank vorhanden (${size} kB)`);
  try {
    const open = () => {
      if (driver === 'better-sqlite3') {
        const BetterSqlite3 = require_('better-sqlite3');
        return new BetterSqlite3(dbFile, { readonly: true });
      }
      const { DatabaseSync } = require_('node:sqlite');
      return new DatabaseSync(dbFile);
    };
    const db = open();
    const count = (table) => {
      try {
        return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      } catch {
        return '—';
      }
    };
    say('·', `Unternehmen: ${count('companies')}, Entwürfe: ${count('emails')}, Protokoll: ${count('audit_logs')}`);
    const settings = (() => {
      try {
        return JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'app.settings'").get()?.value ?? '{}');
      } catch {
        return {};
      }
    })();
    if (settings.mail?.transport && settings.mail.transport !== 'none') {
      say('✓', `Versandweg: ${settings.mail.transport} als ${settings.mail.identity?.email ?? '(kein Absender)'}`);
    } else {
      say('·', 'Versandweg noch nicht eingerichtet (in der App unter „Einrichtung")');
    }
    if (settings.llm?.provider) {
      say('·', `Modell: ${settings.llm.provider}/${settings.llm.model}`);
    }
    db.close();
  } catch (error) {
    say('✕', `Datenbank nicht lesbar: ${error.message}`);
  }
} else {
  say('·', 'Noch keine Datenbank — die App legt sie beim ersten Start an.');
}

// --- Zugänge --------------------------------------------------------------

lines.push('');
lines.push('Umgebungsvariablen (Alternative zum verschlüsselten Speicher in der App):');
for (const [name, purpose] of ENV_KEYS) {
  const value = process.env[name];
  say(value ? '✓' : '·', `${name.padEnd(22)} ${value ? `gesetzt (…${value.slice(-4)})` : 'nicht gesetzt'} — ${purpose}`);
}

lines.push('');
lines.push('Hinweis: Geheimnisse, die in der App unter „Zugänge" hinterlegt werden, liegen');
lines.push('verschlüsselt im Schlüsselbund des Betriebssystems und tauchen hier nicht auf.');

console.log(lines.join('\n'));
