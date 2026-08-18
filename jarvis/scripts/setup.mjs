#!/usr/bin/env node
/**
 * Setup assistant for the parts that are not secret: company profile, sender
 * identity, transport and research settings. It writes straight into the same
 * SQLite database the app uses.
 *
 * Secrets are deliberately NOT handled here. They belong in the operating
 * system keychain, which only the running app can open — the assistant prints
 * exactly which ones are still missing and where to put them.
 */
import { createInterface } from 'node:readline/promises';
import { mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stdin, stdout } from 'node:process';
import { databaseFile, resolveDataDir } from './dataDir.mjs';

const require_ = createRequire(import.meta.url);
const rl = createInterface({ input: stdin, output: stdout });

function openDatabase(file) {
  try {
    const BetterSqlite3 = require_('better-sqlite3');
    return new BetterSqlite3(file);
  } catch {
    const { DatabaseSync } = require_('node:sqlite');
    return new DatabaseSync(file);
  }
}

const ask = async (question, fallback = '') => {
  const answer = (await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim();
  return answer || fallback;
};

const askChoice = async (question, choices, fallback) => {
  console.log(`\n${question}`);
  for (const [index, choice] of choices.entries()) {
    console.log(`  ${index + 1}) ${choice.label}`);
  }
  const answer = await ask('Auswahl', String(choices.findIndex((choice) => choice.value === fallback) + 1));
  const picked = choices[Number.parseInt(answer, 10) - 1];
  return picked?.value ?? fallback;
};

console.log('\nJARVIS — Einrichtung\n====================\n');

const dataDir = resolveDataDir();
mkdirSync(dataDir, { recursive: true });
const file = databaseFile();
const fresh = !existsSync(file);
const db = openDatabase(file);

db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

const stored = (() => {
  try {
    return JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'app.settings'").get()?.value ?? '{}');
  } catch {
    return {};
  }
})();

console.log(`Datenordner: ${dataDir}`);
console.log(fresh ? 'Es wird eine neue Konfiguration angelegt.\n' : 'Bestehende Konfiguration wird ergänzt.\n');

// --- Unternehmen ----------------------------------------------------------

console.log('— Ihr Unternehmen —');
const company = {
  name: await ask('Firmenname', stored.company?.name ?? ''),
  services: await ask('Leistungen (kurz)', stored.company?.services ?? ''),
  pitch: await ask('Positionierung in einem Satz', stored.company?.pitch ?? ''),
  website: await ask('Website', stored.company?.website ?? ''),
  phone: await ask('Telefon', stored.company?.phone ?? ''),
  address: await ask('Anschrift', stored.company?.address ?? ''),
};

// --- Absender -------------------------------------------------------------

console.log('\n— Postausgang —');
const transport = await askChoice(
  'Wie sollen Mails versendet werden?',
  [
    { value: 'smtp', label: 'SMTP (Host, Benutzer, App-Passwort)' },
    { value: 'gmail', label: 'Gmail über OAuth' },
    { value: 'none', label: 'Vorerst gar nicht' },
  ],
  stored.mail?.transport ?? 'smtp',
);

const identity = {
  name: await ask('Absendername', stored.mail?.identity?.name ?? company.name),
  email: await ask('Absenderadresse', stored.mail?.identity?.email ?? ''),
  replyTo: await ask('Antwortadresse (optional)', stored.mail?.identity?.replyTo ?? ''),
  signature: stored.mail?.identity?.signature ?? `${company.name}\n${company.phone}\n${company.website}`,
};

const mail = { transport, identity };

if (transport === 'smtp') {
  const host = await ask('SMTP-Host', stored.mail?.smtp?.host ?? '');
  const port = Number.parseInt(await ask('Port (465 = SSL, 587 = STARTTLS)', String(stored.mail?.smtp?.port ?? 587)), 10);
  mail.smtp = {
    host,
    port,
    secure: port === 465,
    user: await ask('SMTP-Benutzer', stored.mail?.smtp?.user ?? identity.email),
  };
}
if (transport === 'gmail') {
  mail.gmail = {
    clientId: await ask('Gmail Client-ID', stored.mail?.gmail?.clientId ?? ''),
    redirectUri: stored.mail?.gmail?.redirectUri ?? 'http://127.0.0.1:8765/oauth',
  };
}

const wantsImap = (await ask('Posteingang per IMAP einrichten, um Antworten zuzuordnen? (j/n)', 'j')).toLowerCase();
if (wantsImap.startsWith('j')) {
  mail.imap = {
    host: await ask('IMAP-Host', stored.mail?.imap?.host ?? ''),
    port: Number.parseInt(await ask('IMAP-Port', String(stored.mail?.imap?.port ?? 993)), 10),
    secure: true,
    user: await ask('IMAP-Benutzer', stored.mail?.imap?.user ?? identity.email),
    mailbox: await ask('Postfach', stored.mail?.imap?.mailbox ?? 'INBOX'),
  };
}

// --- Modell und Recherche -------------------------------------------------

console.log('\n— Sprachmodell —');
const llmProvider = await askChoice(
  'Welcher Anbieter?',
  [
    { value: 'anthropic', label: 'Anthropic (Claude) — empfohlen' },
    { value: 'openai', label: 'OpenAI-kompatibel' },
    { value: 'ollama', label: 'Ollama, lokal' },
  ],
  stored.llm?.provider ?? 'anthropic',
);
const defaultModel =
  llmProvider === 'anthropic' ? 'claude-opus-5' : llmProvider === 'openai' ? 'gpt-4o' : 'llama3.1';
const llm = {
  provider: llmProvider,
  model: await ask('Modell', stored.llm?.model ?? defaultModel),
  effort: stored.llm?.effort ?? 'high',
  maxTokens: stored.llm?.maxTokens ?? 16000,
};

console.log('\n— Recherche —');
const searchProvider = await askChoice(
  'Suchanbieter',
  [
    { value: 'duckduckgo', label: 'DuckDuckGo — ohne Schlüssel, dünnere Treffer' },
    { value: 'brave', label: 'Brave Search — Schlüssel nötig' },
    { value: 'tavily', label: 'Tavily — Schlüssel nötig' },
    { value: 'serpapi', label: 'SerpAPI — Schlüssel nötig' },
  ],
  stored.research?.searchProvider ?? 'duckduckgo',
);

// --- Schreiben ------------------------------------------------------------

const next = {
  ...stored,
  company,
  mail,
  llm,
  research: { ...(stored.research ?? {}), searchProvider },
  setupCompleted: true,
};

db.prepare(
  "INSERT INTO settings (key, value) VALUES ('app.settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
).run(JSON.stringify(next));
db.close();

console.log('\n✓ Einstellungen gespeichert.\n');

// --- Was noch fehlt -------------------------------------------------------

const missing = [];
if (llmProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
  missing.push('ANTHROPIC_API_KEY — Sprachmodell');
}
if (llmProvider === 'openai' && !process.env.OPENAI_API_KEY) {
  missing.push('OPENAI_API_KEY — Sprachmodell');
}
if (transport === 'smtp' && !process.env.SMTP_PASSWORD) missing.push('SMTP_PASSWORD — Postausgang');
if (transport === 'gmail') {
  if (!process.env.GMAIL_CLIENT_SECRET) missing.push('GMAIL_CLIENT_SECRET — Gmail');
  if (!process.env.GMAIL_REFRESH_TOKEN) missing.push('GMAIL_REFRESH_TOKEN — mit „node scripts/gmail-auth.mjs" erzeugen');
}
if (mail.imap && !process.env.IMAP_PASSWORD) missing.push('IMAP_PASSWORD — Posteingang');
if (searchProvider === 'brave' && !process.env.BRAVE_SEARCH_API_KEY) missing.push('BRAVE_SEARCH_API_KEY — Suche');
if (searchProvider === 'tavily' && !process.env.TAVILY_API_KEY) missing.push('TAVILY_API_KEY — Suche');
if (searchProvider === 'serpapi' && !process.env.SERPAPI_API_KEY) missing.push('SERPAPI_API_KEY — Suche');

if (missing.length === 0) {
  console.log('Alle benötigten Zugänge sind als Umgebungsvariablen gesetzt.');
} else {
  console.log('Diese Zugänge fehlen noch:\n');
  for (const entry of missing) console.log(`  · ${entry}`);
  console.log(
    '\nZwei Möglichkeiten:\n' +
      '  a) In der App unter „Einrichtung → Zugänge" eintragen. Dann liegen sie\n' +
      '     verschlüsselt im Schlüsselbund des Betriebssystems (empfohlen).\n' +
      '  b) Als Umgebungsvariablen setzen — siehe .env.example.\n',
  );
}

console.log('Weiter mit:  npm start\n');
rl.close();
